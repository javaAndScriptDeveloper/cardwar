import { signal } from '@preact/signals';
import { validatePack } from './schema';
import type { PackIndexEntry, PackManifest } from './types';

/** The pack whose faces, sounds and rules this device uses; undefined means the built-in classic look. */
export const equipped = signal<PackManifest | undefined>(undefined);

/** A pack-relative path as an absolute URL path under the app base, with any `..` resolved. */
export function assetUrl(packId: string, path: string): string {
    return new URL(path, `https://pack.invalid${import.meta.env.BASE_URL}packs/${packId}/`).pathname;
}

/**
 * Fetches and validates `pack.json` lazily, once per pack. Validation is lenient: unknown vocabulary is logged and
 * the engine skips it, so a pack written for a newer client still shows its faces. A broken pack is rejected and
 * not cached, so the next attempt fetches again.
 */
export class PackLoader {
    private readonly cache = new Map<string, Promise<PackManifest>>();

    constructor(private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {}

    load(id: string): Promise<PackManifest> {
        let pending = this.cache.get(id);
        if (!pending) {
            pending = this.fetchPack(id);
            pending.catch(() => this.cache.delete(id));
            this.cache.set(id, pending);
        }
        return pending;
    }

    private async fetchPack(id: string): Promise<PackManifest> {
        const response = await this.fetchImpl(
            `${import.meta.env.BASE_URL}packs/${encodeURIComponent(id)}/pack.json`,
        );
        if (!response.ok) {
            throw new Error(`pack ${id}: HTTP ${response.status}`);
        }
        const json: unknown = await response.json();
        const { errors, warnings } = validatePack(json, { strict: false });
        if (errors.length > 0) {
            throw new Error(`pack ${id}: ${errors.join('; ')}`);
        }
        for (const warning of warnings) {
            console.warn(`pack ${id}: ${warning}`);
        }
        return json as PackManifest;
    }
}

/** The installed packs, as `npm run packs:check` listed them at build time. */
export async function fetchPackIndex(
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<PackIndexEntry[]> {
    const response = await fetchImpl(`${import.meta.env.BASE_URL}packs/index.json`);
    if (!response.ok) {
        throw new Error(`pack index: HTTP ${response.status}`);
    }
    return (await response.json()) as PackIndexEntry[];
}

interface EquipDeps {
    loader: PackLoader;
    audio: { register(name: string, url: string): void };
}

let latest = 0;

/**
 * Makes `id` the equipped pack: its sounds are registered as `<id>:<name>`, its stylesheet (css animation classes)
 * added once, and the faces switch when `equipped` changes. If it cannot load, the classic look stays. When the
 * player switches again before a slow load finishes, the last choice wins.
 */
export async function equip(id: string, { loader, audio }: EquipDeps): Promise<void> {
    const ticket = ++latest;
    let pack: PackManifest | undefined;
    try {
        pack = await loader.load(id);
    } catch (error) {
        console.warn(`pack ${id} not equipped: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (ticket !== latest) {
        return;
    }
    if (pack) {
        for (const [name, path] of Object.entries(pack.sounds ?? {})) {
            audio.register(`${pack.id}:${name}`, assetUrl(pack.id, path));
        }
        if (pack.styles && !document.head.querySelector(`link[data-pack="${pack.id}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = assetUrl(pack.id, pack.styles);
            link.dataset['pack'] = pack.id;
            document.head.append(link);
        }
    }
    equipped.value = pack;
}
