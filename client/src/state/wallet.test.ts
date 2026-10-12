import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletView } from '../api/types';
import { refreshWallet, wallet } from './wallet';

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
});
