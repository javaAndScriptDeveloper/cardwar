import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletView } from '../api/types';
import { awaitCredit, refreshWallet, wallet } from './wallet';

const view = (balance: number): WalletView => ({
    balance,
    dailyBonus: { available: true, amount: 50, streakDay: 1, nextAt: '2026-10-13T21:00:00Z' },
});

describe('wallet', () => {
    beforeEach(() => {
        wallet.value = undefined;
    });

    it('loads the wallet into the signal', async () => {
        await refreshWallet({ wallet: vi.fn().mockResolvedValue(view(500)) });

        expect(wallet.value?.balance).toBe(500);
    });

    it('keeps the last known wallet when a refresh fails', async () => {
        wallet.value = view(700);

        await refreshWallet({ wallet: vi.fn().mockRejectedValue(new Error('offline')) });

        expect(wallet.value?.balance).toBe(700);
    });

    it('keeps re-reading after a payment until the credit shows up', async () => {
        wallet.value = view(200);
        const api = {
            wallet: vi
                .fn()
                .mockResolvedValueOnce(view(200))
                .mockResolvedValueOnce(view(200))
                .mockResolvedValue(view(1200)),
        };

        const credited = await awaitCredit(api, 200, { delaysMs: [1, 1, 1, 1] });

        expect(credited).toBe(true);
        expect(wallet.value?.balance).toBe(1200);
        expect(api.wallet).toHaveBeenCalledTimes(3);
    });

    it('gives up after its attempts and reports the credit as pending', async () => {
        wallet.value = view(200);
        const api = { wallet: vi.fn().mockResolvedValue(view(200)) };

        const credited = await awaitCredit(api, 200, { delaysMs: [1, 1] });

        expect(credited).toBe(false);
        expect(api.wallet).toHaveBeenCalledTimes(2);
    });
});
