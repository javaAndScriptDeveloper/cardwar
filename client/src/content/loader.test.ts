import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetUrl, equip, equipped, fetchPackIndex, PackLoader } from './loader';

const base = import.meta.env.BASE_URL;
const shipped = (id: string) =>
    JSON.parse(readFileSync(resolve('public/packs', id, 'pack.json'), 'utf8')) as unknown;

/** A fetch that serves the shipped packs from disk and 404s anything else. */
function fakeFetch(overrides: Record<string, unknown> = {}) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const id = /packs\/([^/]+)\/pack\.json$/.exec(url)?.[1] ?? '';
        const body =
            id in overrides
                ? overrides[id]
                : ['classic', 'memes-demo'].includes(id)
                  ? shipped(id)
                  : undefined;
        return body === undefined
            ? new Response('missing', { status: 404 })
            : new Response(JSON.stringify(body), { status: 200 });
    });
}

describe('assetUrl', () => {
    it('resolves pack-relative paths under the app base', () => {
        expect(assetUrl('memes-demo', 'cards/KING_OF_SPADES.svg')).toBe(
            `${base}packs/memes-demo/cards/KING_OF_SPADES.svg`,
        );
    });

    it('normalizes paths that climb to shared assets', () => {
        expect(assetUrl('classic', '../../cards/classic/back.svg')).toBe(`${base}cards/classic/back.svg`);
    });
});

describe('PackLoader', () => {
    it('fetches a pack once and caches it', async () => {
        const fetchImpl = fakeFetch();
        const loader = new PackLoader(fetchImpl);

        const first = await loader.load('memes-demo');
        const second = await loader.load('memes-demo');

        expect(first.id).toBe('memes-demo');
        expect(second).toBe(first);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`${base}packs/memes-demo/pack.json`);
    });

    it('rejects a pack that is missing or invalid, and tries again next time', async () => {
        const fetchImpl = fakeFetch({ broken: { id: 'broken' } });
        const loader = new PackLoader(fetchImpl);

        await expect(loader.load('nope')).rejects.toThrow('404');
        await expect(loader.load('broken')).rejects.toThrow('version');
        await expect(loader.load('nope')).rejects.toThrow();
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('loads a pack with unknown vocabulary, warning about it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const future = { ...(shipped('memes-demo') as object), sparkle: true };
        const loader = new PackLoader(fakeFetch({ 'memes-demo': future }));

        await expect(loader.load('memes-demo')).resolves.toMatchObject({ id: 'memes-demo' });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('sparkle'));
        warn.mockRestore();
    });
});

describe('equip', () => {
    beforeEach(() => {
        equipped.value = undefined;
        document.head.innerHTML = '';
    });
    afterEach(() => {
        equipped.value = undefined;
    });

    it('registers the pack sounds under its id, adds its stylesheet once and equips it', async () => {
        const audio = { register: vi.fn() };
        const loader = new PackLoader(fakeFetch());

        await equip('memes-demo', { loader, audio });
        await equip('memes-demo', { loader, audio });

        expect(equipped.value?.id).toBe('memes-demo');
        expect(audio.register).toHaveBeenCalledWith(
            'memes-demo:lose_money',
            `${base}packs/memes-demo/sounds/lose_money.wav`,
        );
        const links = document.head.querySelectorAll('link[data-pack="memes-demo"]');
        expect(links).toHaveLength(1);
        expect(links[0]?.getAttribute('href')).toBe(`${base}packs/memes-demo/anim/fx.css`);
    });

    it('falls back to the classic faces when the pack cannot load', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const loader = new PackLoader(fakeFetch());
        await equip('memes-demo', { loader, audio: { register: vi.fn() } });

        await equip('nope', { loader, audio: { register: vi.fn() } });

        expect(equipped.value).toBeUndefined();
        warn.mockRestore();
    });

    it('keeps the last choice when an earlier load finishes later', async () => {
        let release: () => void = () => {};
        const slow = new Promise<void>((resolve) => (release = resolve));
        const inner = fakeFetch();
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).includes('memes-demo')) {
                await slow;
            }
            return inner(input);
        });
        const loader = new PackLoader(fetchImpl);
        const audio = { register: vi.fn() };

        const first = equip('memes-demo', { loader, audio });
        await equip('classic', { loader, audio });
        release();
        await first;

        expect(equipped.value?.id).toBe('classic');
    });
});

describe('fetchPackIndex', () => {
    it('reads the index the build wrote', async () => {
        const index = [{ id: 'classic', name: { uk: 'Класична' }, preview: [] }];
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify(index)));

        await expect(fetchPackIndex(fetchImpl)).resolves.toEqual(index);
        expect(fetchImpl).toHaveBeenCalledWith(`${base}packs/index.json`);
    });

    it('fails on an HTTP error', async () => {
        await expect(fetchPackIndex(async () => new Response('', { status: 500 }))).rejects.toThrow('500');
    });
});
