import { signal } from '@preact/signals';
import type { ApiClient } from '../api/client';
import type { MissionView, ProgressView } from '../api/types';

/** The signed-in player's streak, XP and rank; undefined until the first load. */
export const progress = signal<ProgressView | undefined>(undefined);

/** Today's missions; undefined until the first load. */
export const missions = signal<MissionView[] | undefined>(undefined);

/**
 * Re-reads the progress. Like the wallet, a failure keeps the last known value: these numbers are only shown, never
 * acted on, so a stale streak beats a missing chip.
 */
export async function refreshProgress(api: Pick<ApiClient, 'progress'>): Promise<void> {
    try {
        progress.value = await api.progress();
    } catch {
        // Keep what we had; the next duel or visit to the lobby refreshes it again.
    }
}

export async function refreshMissions(api: Pick<ApiClient, 'missions'>): Promise<void> {
    try {
        missions.value = await api.missions();
    } catch {
        // Keep what we had; a claim refuses on the server anyway when the list is stale.
    }
}
