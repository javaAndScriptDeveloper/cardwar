import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackIndexEntry } from '../../content/types';
import { DEFAULT_SETTINGS, settings } from '../../state/settings';
import { Settings } from './Settings';

describe('Settings', () => {
    beforeEach(() => {
        settings.value = DEFAULT_SETTINGS;
    });

    it('shows one toggle per setting reflecting the current value', () => {
        settings.value = { ...DEFAULT_SETTINGS, haptics: false };

        render(<Settings />);

        expect((screen.getByTestId('setting-sound') as HTMLInputElement).checked).toBe(true);
        expect((screen.getByTestId('setting-haptics') as HTMLInputElement).checked).toBe(false);
        expect(screen.getByTestId('setting-swipe')).toBeTruthy();
        expect(screen.getByTestId('setting-music')).toBeTruthy();
        expect(screen.getByTestId('setting-reducedMotion')).toBeTruthy();
    });

    it('flips the setting when toggled', () => {
        render(<Settings />);

        fireEvent.click(screen.getByTestId('setting-sound'));

        expect(settings.value.sound).toBe(false);
        expect((screen.getByTestId('setting-sound') as HTMLInputElement).checked).toBe(false);
    });

    describe('deck picker', () => {
        const base = import.meta.env.BASE_URL;
        const index: PackIndexEntry[] = [
            { id: 'classic', name: { uk: 'Класична' }, preview: ['cards/classic/ace_of_hearts.svg'] },
            {
                id: 'memes-demo',
                name: { uk: 'Мемна колода (демо)' },
                preview: [
                    'packs/memes-demo/cards/ACE_OF_HEARTS.svg',
                    'packs/memes-demo/cards/KING_OF_SPADES.svg',
                ],
            },
        ];

        it('lists the installed packs with previews and marks the equipped one', async () => {
            render(<Settings loadIndex={() => Promise.resolve(index)} />);

            const memes = await screen.findByTestId('deck-memes-demo');
            expect(screen.getByTestId('deck-picker')).toBeTruthy();
            expect(screen.getByTestId('deck-classic').getAttribute('aria-checked')).toBe('true');
            expect(memes.getAttribute('aria-checked')).toBe('false');
            expect([...memes.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
                `${base}packs/memes-demo/cards/ACE_OF_HEARTS.svg`,
                `${base}packs/memes-demo/cards/KING_OF_SPADES.svg`,
            ]);
        });

        it('equips a deck when picked', async () => {
            render(<Settings loadIndex={() => Promise.resolve(index)} />);

            fireEvent.click(await screen.findByTestId('deck-memes-demo'));

            expect(settings.value.deck).toBe('memes-demo');
            await waitFor(() =>
                expect(screen.getByTestId('deck-memes-demo').getAttribute('aria-checked')).toBe('true'),
            );
        });

        it('says so when the list cannot load, keeping the other settings usable', async () => {
            render(<Settings loadIndex={vi.fn().mockRejectedValue(new Error('offline'))} />);

            expect(await screen.findByTestId('deck-picker-error')).toBeTruthy();
            expect(screen.getByTestId('setting-sound')).toBeTruthy();
        });
    });
});
