import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, settings, updateSettings } from './settings';

describe('settings', () => {
    beforeEach(() => {
        settings.value = DEFAULT_SETTINGS;
    });

    it('persists a change', () => {
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
        };
        loadSettings(storage);

        updateSettings({ sound: false });

        expect(JSON.parse(store.get('cardwar.settings.v1') ?? '{}')).toMatchObject({ sound: false });
        expect(settings.value.sound).toBe(false);
    });

    it('loads what was persisted and ignores unknown or malformed keys', () => {
        const storage = {
            getItem: () => JSON.stringify({ haptics: false, bogus: 1, sound: 'yes' }),
            setItem: vi.fn(),
        };

        loadSettings(storage);

        expect(settings.value).toEqual({ ...DEFAULT_SETTINGS, haptics: false });
    });

    it('survives a throwing storage', () => {
        const storage = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
        };

        expect(() => loadSettings(storage)).not.toThrow();
        expect(() => updateSettings({ sound: false })).not.toThrow();
        expect(settings.value.sound).toBe(false);
    });

    it('defaults to the classic deck and remembers the one picked', () => {
        expect(DEFAULT_SETTINGS.deck).toBe('classic');
        const store = new Map<string, string>();
        const storage = {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
        };
        loadSettings(storage);
        updateSettings({ deck: 'memes-demo' });

        loadSettings(storage);

        expect(settings.value.deck).toBe('memes-demo');
    });

    it.each([42, '', 'Bad Deck', '../x'])('ignores a stored deck of %j', (deck) => {
        loadSettings({ getItem: () => JSON.stringify({ deck }), setItem: vi.fn() });

        expect(settings.value.deck).toBe('classic');
    });

    it('survives storage that is absent', () => {
        expect(() => loadSettings(undefined)).not.toThrow();
        expect(settings.value).toEqual(DEFAULT_SETTINGS);
    });
});
