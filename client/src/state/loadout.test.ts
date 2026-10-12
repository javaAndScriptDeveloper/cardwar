import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadoutView } from '../api/types';
import { applyLoadout, loadout, pickDeckLocally, refreshLoadout } from './loadout';
import { DEFAULT_SETTINGS, settings } from './settings';

const view = (overrides: Partial<LoadoutView> = {}): LoadoutView => ({
    deck: 'memes-demo',
    cardBack: 'trident',
    table: 'night',
    emotes: ['like'],
    ...overrides,
});

describe('loadout', () => {
    beforeEach(() => {
        loadout.value = undefined;
        settings.value = DEFAULT_SETTINGS;
    });

    it("loads the server loadout and makes its deck the device's deck", async () => {
        await refreshLoadout({ loadout: vi.fn().mockResolvedValue(view()) });

        expect(loadout.value?.cardBack).toBe('trident');
        expect(settings.value.deck).toBe('memes-demo');
    });

    it('keeps the last known loadout when a refresh fails', async () => {
        loadout.value = view({ table: 'borscht' });

        await refreshLoadout({ loadout: vi.fn().mockRejectedValue(new Error('offline')) });

        expect(loadout.value.table).toBe('borscht');
    });

    it('applies an equip answer at once', () => {
        applyLoadout(view({ deck: 'classic' }));

        expect(loadout.value?.deck).toBe('classic');
        expect(settings.value.deck).toBe('classic');
    });

    it('lets a local try-on made during the request win over the late answer', async () => {
        let answer: (value: LoadoutView) => void = () => {};
        const pending = refreshLoadout({
            loadout: () => new Promise<LoadoutView>((resolve) => (answer = resolve)),
        });

        pickDeckLocally('memes-demo');
        answer(view({ deck: 'classic' }));
        await pending;

        expect(loadout.value?.deck).toBe('classic');
        expect(settings.value.deck).toBe('memes-demo');
    });
});
