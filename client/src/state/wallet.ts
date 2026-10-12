import { signal } from '@preact/signals';
import type { ApiClient } from '../api/client';
import type { WalletView } from '../api/types';

/** The signed-in player's coins and daily bonus; undefined until the first load. Read `wallet.value` anywhere. */
export const wallet = signal<WalletView | undefined>(undefined);

/**
 * Re-reads the wallet. A failure keeps the last known value: the balance is shown, never acted on (the server
 * checks every stake), so a slightly stale number beats a blank chip.
 */
export async function refreshWallet(api: Pick<ApiClient, 'wallet'>): Promise<void> {
    try {
        wallet.value = await api.wallet();
    } catch {
        // Keep what we had; the next sign-in, result or claim refreshes it again.
    }
}

/**
 * After a Stars payment the coins arrive with Telegram's successful_payment webhook, which can land after the
 * client's "paid" callback. Re-read with backoff until the balance passes `before`; false when it never did, so
 * the screen can say the credit is on its way instead of showing the old balance as if nothing happened.
 */
export async function awaitCredit(
    api: Pick<ApiClient, 'wallet'>,
    before: number,
    { delaysMs = [500, 1000, 2000, 4000, 8000] }: { delaysMs?: number[] } = {},
): Promise<boolean> {
    for (const delay of delaysMs) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await refreshWallet(api);
        if ((wallet.value?.balance ?? before) > before) {
            return true;
        }
    }
    return false;
}
