import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopItemView } from '../../api/types';
import type { PackIndexEntry } from '../../content/types';
import { loadout } from '../../state/loadout';
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

        describe('signed in with a shop', () => {
            const deckItem = (contentRef: string, owned: boolean): ShopItemView => ({
                code: `deck-${contentRef}`,
                type: 'DECK',
                contentRef,
                name: contentRef,
                price: owned ? 0 : 1000,
                owned,
                equipped: contentRef === 'classic',
            });
            const shopApi = (memesOwned: boolean) => ({
                shop: vi.fn().mockResolvedValue({
                    items: [deckItem('classic', true), deckItem('memes-demo', memesOwned)],
                    drops: [],
                    coinPacks: [],
                }),
                equipItem: vi.fn().mockResolvedValue({
                    deck: 'memes-demo',
                    cardBack: 'classic',
                    table: 'green',
                    emotes: [],
                }),
            });

            beforeEach(() => {
                loadout.value = undefined;
            });

            it('equips an owned deck through the shop, which also moves the device deck', async () => {
                const api = shopApi(true);
                render(<Settings loadIndex={() => Promise.resolve(index)} api={api} inTelegram />);

                await waitFor(() =>
                    expect(screen.getByTestId('deck-memes-demo').getAttribute('data-owned')).toBe('true'),
                );
                fireEvent.click(screen.getByTestId('deck-memes-demo'));

                await waitFor(() => expect(settings.value.deck).toBe('memes-demo'));
                expect(api.equipItem).toHaveBeenCalledWith('deck-memes-demo');
                expect(loadout.value?.deck).toBe('memes-demo');
            });

            it('sends an unowned deck to the shop inside Telegram instead of equipping it', async () => {
                const api = shopApi(false);
                const onOpenShop = vi.fn();
                render(
                    <Settings
                        loadIndex={() => Promise.resolve(index)}
                        api={api}
                        inTelegram
                        onOpenShop={onOpenShop}
                    />,
                );

                fireEvent.click(await screen.findByTestId('deck-shop-memes-demo'));
                fireEvent.click(screen.getByTestId('deck-memes-demo'));

                // Both the link and the deck itself lead to the shop.
                expect(onOpenShop).toHaveBeenCalledTimes(2);
                expect(api.equipItem).not.toHaveBeenCalled();
                expect(settings.value.deck).toBe('classic');
            });

            it('lets the dev shim try an unowned deck on locally', async () => {
                const api = shopApi(false);
                render(<Settings loadIndex={() => Promise.resolve(index)} api={api} inTelegram={false} />);

                await screen.findByTestId('deck-shop-memes-demo');
                fireEvent.click(screen.getByTestId('deck-memes-demo'));

                expect(settings.value.deck).toBe('memes-demo');
                expect(api.equipItem).not.toHaveBeenCalled();
            });
        });

        it('says so when the list cannot load, keeping the other settings usable', async () => {
            render(<Settings loadIndex={vi.fn().mockRejectedValue(new Error('offline'))} />);

            expect(await screen.findByTestId('deck-picker-error')).toBeTruthy();
            expect(screen.getByTestId('setting-sound')).toBeTruthy();
        });
    });
});
