import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { LoadoutView, ShopItemView, ShopView, WalletView } from '../../api/types';
import type { PackIndexEntry } from '../../content/types';
import { t } from '../../i18n';
import { loadout } from '../../state/loadout';
import { DEFAULT_SETTINGS, settings } from '../../state/settings';
import { wallet } from '../../state/wallet';
import { Shop } from './Shop';

const item = (code: string, overrides: Partial<ShopItemView>): ShopItemView => ({
    code,
    type: 'CARD_BACK',
    contentRef: code.replace(/^[a-z]+-/, ''),
    name: code,
    price: 300,
    owned: false,
    equipped: false,
    ...overrides,
});

const catalog = (): ShopView => ({
    items: [
        item('deck-classic', { type: 'DECK', price: 0, owned: true, equipped: true }),
        item('deck-memes-demo', { type: 'DECK', price: 1000 }),
        item('back-classic', { price: 0, owned: true, equipped: true }),
        item('back-trident', {}),
        item('table-green', { type: 'TABLE', price: 0, owned: true, equipped: true }),
        item('table-night', { type: 'TABLE', price: 500 }),
        item('frame-gold', { type: 'FRAME', price: 800 }),
        item('emote-like', { type: 'EMOTE', price: 100, owned: true }),
        item('emote-fire', { type: 'EMOTE', price: 150 }),
    ],
    coinPacks: [
        { id: 'coins-1000', coins: 1000, stars: 50 },
        { id: 'coins-5500', coins: 5500, stars: 250 },
    ],
});

const walletView = (balance: number): WalletView => ({
    balance,
    dailyBonus: { available: false, amount: 50, streakDay: 1, nextAt: '2099-01-01T00:00:00Z' },
});

const loadoutView = (overrides: Partial<LoadoutView> = {}): LoadoutView => ({
    deck: 'classic',
    cardBack: 'classic',
    table: 'green',
    emotes: ['like'],
    ...overrides,
});

const index: PackIndexEntry[] = [
    { id: 'classic', name: { uk: 'Класична' }, preview: ['cards/classic/ace_of_hearts.svg'] },
    { id: 'memes-demo', name: { uk: 'Мемна' }, preview: ['packs/memes-demo/cards/ACE_OF_HEARTS.svg'] },
];

function setup(overrides: Partial<ReturnType<typeof fakeApi>> = {}) {
    const api = { ...fakeApi(), ...overrides };
    const telegram = { openInvoice: vi.fn() };
    render(<Shop api={api} telegram={telegram} loadIndex={() => Promise.resolve(index)} />);
    return { api, telegram };
}

function fakeApi() {
    return {
        shop: vi.fn().mockResolvedValue(catalog()),
        buyItem: vi.fn(),
        equipItem: vi.fn(),
        starsInvoice: vi.fn(),
        wallet: vi.fn().mockResolvedValue(walletView(200)),
    };
}

const tab = (id: string) => fireEvent.click(screen.getByTestId(`tab-${id}`));

describe('Shop', () => {
    beforeEach(() => {
        wallet.value = walletView(500);
        loadout.value = undefined;
        settings.value = DEFAULT_SETTINGS;
    });

    it('shows a tab per type plus coins, opening on the decks with pack previews and prices', async () => {
        setup();

        const memes = await screen.findByTestId('item-deck-memes-demo');
        for (const id of ['decks', 'backs', 'tables', 'frames', 'emotes', 'coins']) {
            expect(screen.getByTestId(`tab-${id}`)).toBeTruthy();
        }
        expect(screen.getByTestId('item-deck-classic').getAttribute('data-equipped')).toBe('true');
        await waitFor(() =>
            expect(memes.querySelector('img')?.getAttribute('src')).toBe(
                `${import.meta.env.BASE_URL}packs/memes-demo/cards/ACE_OF_HEARTS.svg`,
            ),
        );
        expect(within(memes).getByTestId('price').getAttribute('data-amount')).toBe('1000');
        expect(screen.getByTestId('buy-deck-memes-demo')).toBeTruthy();
        expect(screen.queryByTestId('item-back-trident')).toBeNull();
    });

    it('previews backs, tables and frames as swatches and emotes as glyphs', async () => {
        setup();
        await screen.findByTestId('item-deck-classic');

        tab('backs');
        expect(screen.getByTestId('item-back-trident').querySelector('[data-back="trident"]')).toBeTruthy();
        tab('tables');
        expect(screen.getByTestId('item-table-night').querySelector('[data-table="night"]')).toBeTruthy();
        tab('frames');
        expect(screen.getByTestId('item-frame-gold').querySelector('[data-frame="gold"]')).toBeTruthy();
        tab('emotes');
        expect(screen.getByTestId('item-emote-fire').textContent).toContain('🔥');
        expect(screen.getByTestId('item-emote-like').getAttribute('data-owned')).toBe('true');
        expect(screen.queryByTestId('equip-emote-like')).toBeNull();
    });

    it('buys an item, then offers to equip it and shows the new balance', async () => {
        const { api } = setup();
        api.buyItem.mockResolvedValue(item('back-trident', { owned: true }));
        await screen.findByTestId('item-deck-classic');
        tab('backs');

        fireEvent.click(screen.getByTestId('buy-back-trident'));

        await screen.findByTestId('equip-back-trident');
        expect(api.buyItem).toHaveBeenCalledWith('back-trident');
        await waitFor(() => expect(wallet.value?.balance).toBe(200));
    });

    it('equips an owned item, moving the equipped mark within its type and updating the loadout', async () => {
        const { api } = setup({
            shop: vi.fn().mockResolvedValue({
                ...catalog(),
                items: catalog().items.map((entry) =>
                    entry.code === 'back-trident' ? { ...entry, owned: true } : entry,
                ),
            }),
        });
        api.equipItem.mockResolvedValue(loadoutView({ cardBack: 'trident' }));
        await screen.findByTestId('item-deck-classic');
        tab('backs');

        fireEvent.click(screen.getByTestId('equip-back-trident'));

        await waitFor(() =>
            expect(screen.getByTestId('item-back-trident').getAttribute('data-equipped')).toBe('true'),
        );
        expect(screen.getByTestId('item-back-classic').getAttribute('data-equipped')).toBe('false');
        expect(loadout.value?.cardBack).toBe('trident');
    });

    it('explains a refused purchase by its reason', async () => {
        const { api } = setup();
        api.buyItem.mockRejectedValue(new ApiError(400, { reason: 'INSUFFICIENT_COINS' }));
        await screen.findByTestId('item-deck-classic');

        fireEvent.click(screen.getByTestId('buy-deck-memes-demo'));

        const alert = await screen.findByRole('alert');
        expect(alert.getAttribute('data-reason')).toBe('INSUFFICIENT_COINS');
        expect(alert.textContent).toBe(t('shop.errors.insufficientCoins'));
    });

    it('sells coin packs for Stars through the Telegram invoice and refreshes the wallet once paid', async () => {
        const { api, telegram } = setup();
        api.starsInvoice.mockResolvedValue({ invoiceLink: 'https://t.me/$inv' });
        await screen.findByTestId('item-deck-classic');
        tab('coins');

        const pack = screen.getByTestId('coin-pack-coins-1000');
        expect(within(pack).getByTestId('pack-coins').getAttribute('data-amount')).toBe('1000');
        fireEvent.click(within(pack).getByRole('button'));

        await waitFor(() => expect(telegram.openInvoice).toHaveBeenCalled());
        expect(api.starsInvoice).toHaveBeenCalledWith('coins-1000');
        const [link, onStatus] = telegram.openInvoice.mock.calls[0] as [string, (status: string) => void];
        expect(link).toBe('https://t.me/$inv');
        onStatus('paid');
        await waitFor(() => expect(wallet.value?.balance).toBe(200));
    });

    it('says so when Stars payments are unavailable', async () => {
        const { api } = setup();
        api.starsInvoice.mockRejectedValue(new ApiError(503, { reason: 'PAYMENTS_UNAVAILABLE' }));
        await screen.findByTestId('item-deck-classic');
        tab('coins');

        fireEvent.click(within(screen.getByTestId('coin-pack-coins-1000')).getByRole('button'));

        expect((await screen.findByRole('alert')).textContent).toBe(t('shop.errors.paymentsUnavailable'));
    });
});
