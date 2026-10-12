import { signal } from '@preact/signals';

export interface Settings {
    sound: boolean;
    music: boolean;
    haptics: boolean;
    swipe: boolean;
    reducedMotion: boolean;
    /** Id of the equipped content pack (a folder under /app/packs/). Local until the shop's loadout exists. */
    deck: string;
}

/** The on/off preferences, i.e. every setting but the deck. */
export type Toggle = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export const DEFAULT_SETTINGS: Settings = {
    sound: true,
    music: false,
    haptics: true,
    swipe: true,
    reducedMotion: false,
    deck: 'classic',
};

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;

const KEY = 'cardwar.settings.v1';

type Backing = Pick<Storage, 'getItem' | 'setItem'>;

/** Read `settings.value` anywhere; components re-render through Preact signals when it changes. */
export const settings = signal<Settings>(DEFAULT_SETTINGS);
let storage: Backing | undefined;

/**
 * Per-device conveniences only, so localStorage is the right place; a blocked or missing storage (private mode,
 * a locked-down webview) just means defaults on every launch, never an error.
 */
export function loadSettings(backing: Backing | undefined = safeLocalStorage()): void {
    storage = backing;
    try {
        const raw = storage?.getItem(KEY);
        if (!raw) {
            settings.value = DEFAULT_SETTINGS;
            return;
        }
        const parsed = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
        const next = { ...DEFAULT_SETTINGS };
        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
            const value = parsed[key];
            if (key !== 'deck' && typeof value === 'boolean') {
                next[key] = value;
            }
        }
        if (typeof parsed.deck === 'string' && PACK_ID.test(parsed.deck)) {
            next.deck = parsed.deck;
        }
        settings.value = next;
    } catch {
        settings.value = DEFAULT_SETTINGS;
    }
}

export function updateSettings(patch: Partial<Settings>): void {
    settings.value = { ...settings.value, ...patch };
    try {
        storage?.setItem(KEY, JSON.stringify(settings.value));
    } catch {
        // Storage blocked: the change still applies for this session.
    }
}

function safeLocalStorage(): Storage | undefined {
    try {
        return typeof localStorage === 'undefined' ? undefined : localStorage;
    } catch {
        return undefined;
    }
}
