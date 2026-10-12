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
