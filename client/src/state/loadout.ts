import { signal } from '@preact/signals';
import type { ApiClient } from '../api/client';
import type { LoadoutView } from '../api/types';
import { updateSettings } from './settings';

/** What the signed-in player has equipped (server truth); undefined until the first load. */
export const loadout = signal<LoadoutView | undefined>(undefined);

/** Bumped by every local deck try-on, so a loadout answer that was already in flight cannot undo it. */
let localPicks = 0;

/**
 * The server's loadout is the source of truth for the deck once signed in: its deck is written into the device
 * settings, which is what loads the content pack (see main.tsx).
 */
export function applyLoadout(view: LoadoutView): void {
    loadout.value = view;
    updateSettings({ deck: view.deck });
}

/** Re-reads the loadout; a failure keeps the last known one (cosmetics only, never acted on by the server). */
export async function refreshLoadout(api: Pick<ApiClient, 'loadout'>): Promise<void> {
    const picksBefore = localPicks;
    try {
        const view = await api.loadout();
        if (picksBefore === localPicks) {
            applyLoadout(view);
        } else {
            loadout.value = view;
        }
    } catch {
        // Keep what we had; the defaults draw a perfectly good table.
    }
}

/**
 * Outside Telegram (the dev shim) a deck can be tried on without owning it: only this device draws it, and the
 * next sign-in returns to the server's deck.
 */
export function pickDeckLocally(deck: string): void {
    localPicks++;
    updateSettings({ deck });
}
