import { useEffect, useRef, useState } from 'preact/hooks';
import type { ApiClient } from '../api/client';
import { t } from '../i18n';
import { describeError } from './errors';

export type LaunchApi = Pick<ApiClient, 'activeDuels' | 'pendingInvite'>;

export type Launch =
    | { phase: 'loading' }
    | { phase: 'duel'; duelId: string }
    | { phase: 'invite'; inviteId: string }
    | { phase: 'waiting'; inviteId: string }
    | { phase: 'lobby'; error?: string };

/**
 * Where a signed-in player lands, decided once per app session: a running duel wins, then the invite the app was
 * opened with (a friend's link), then the player's own pending invite (Telegram reloads the Mini App whenever they
 * switch to a chat to send the code), then the lobby.
 */
export function useLaunch(api: LaunchApi, invite: string | undefined): Launch {
    const [launch, setLaunch] = useState<Launch>({ phase: 'loading' });
    const launchInvite = useRef(invite);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const active = await api.activeDuels();
                if (cancelled) {
                    return;
                }
                const resume = active[0];
                if (resume) {
                    setLaunch({ phase: 'duel', duelId: resume.duelId });
                    return;
                }
            } catch (error) {
                if (!cancelled) {
                    setLaunch({
                        phase: 'lobby',
                        error: t('lobby.errors.loadDuels', { error: describeError(error) }),
                    });
                }
                return;
            }
            const inviteId = launchInvite.current;
            launchInvite.current = undefined;
            if (inviteId) {
                setLaunch({ phase: 'invite', inviteId });
                return;
            }
            const own = await api.pendingInvite().catch(() => undefined);
            if (cancelled) {
                return;
            }
            setLaunch(own ? { phase: 'waiting', inviteId: own.inviteId } : { phase: 'lobby' });
        })();
        return () => {
            cancelled = true;
        };
        // Launch-time routing only, so it deliberately runs once.
    }, []);

    return launch;
}
