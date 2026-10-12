import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { SignedInPlayer } from '../auth/session';
import { t } from '../i18n';
import { navigate, TOP_LEVEL, useRoute } from '../router';
import { inviteLink, shareUrl, type LinkConfig } from '../telegram/links';
import type { Telegram } from '../telegram/webapp';
import { describeError } from './errors';
import { Friends } from './friends/Friends';
import { BottomNav } from './kit';
import { Lobby } from './lobby/Lobby';
import { Waiting } from './lobby/Waiting';
import { Profile } from './profile/Profile';
import { Settings } from './settings/Settings';
import { Shop } from './shop/Shop';
import { useLaunch } from './useLaunch';

export type ShellApi = Pick<
    ApiClient,
    'activeDuels' | 'pendingInvite' | 'createInvite' | 'inviteStatus' | 'acceptInvite' | 'history'
>;

interface Props {
    player: SignedInPlayer;
    api: ShellApi;
    telegram: Telegram;
    /** Invite id the app was opened with (Telegram start_param, or ?invite= from the bot's Join button / dev shim). */
    invite: string | undefined;
    links: LinkConfig;
    table: (duelId: string, exit: () => void) => ComponentChildren;
    pollMs?: number;
}

/** Turns an invite failure into a sentence; the status codes are the backend's documented invite answers. */
function inviteProblem(error: unknown): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 404:
                return t('lobby.errors.inviteExpired');
            case 400:
                return t('lobby.errors.ownInvite');
            case 409:
                return t('lobby.errors.inviteTaken');
        }
    }
    return t('lobby.errors.join', { error: describeError(error) });
}

/**
 * The signed-in app: a hash-routed set of screens under a bottom navigation, with the duel taking the whole
 * screen. Navigation lives here; each screen owns only its own content.
 */
export function Shell({ player, api, telegram, invite, links, table, pollMs = 2000 }: Props) {
    const route = useRoute();
    const launch = useLaunch(api, invite);
    // The invite being waited on survives tab changes; a reload recovers it through useLaunch.
    const [waitingFor, setWaitingFor] = useState<string>();
    const [lobbyError, setLobbyError] = useState<string>();
    const [launchHandled, setLaunchHandled] = useState(false);

    const startDuel = useCallback((duelId: string) => {
        setWaitingFor(undefined);
        setLobbyError(undefined);
        navigate({ name: 'duel', duelId });
    }, []);

    const join = useCallback(
        async (inviteId: string) => {
            try {
                startDuel((await api.acceptInvite(inviteId)).duelId);
            } catch (error) {
                setLobbyError(inviteProblem(error));
                navigate({ name: 'lobby' });
            }
        },
        [api, startDuel],
    );

    useEffect(() => {
        if (launchHandled || launch.phase === 'loading') {
            return;
        }
        setLaunchHandled(true);
        switch (launch.phase) {
            case 'duel':
                startDuel(launch.duelId);
                break;
            case 'invite':
                void join(launch.inviteId);
                break;
            case 'waiting':
                setWaitingFor(launch.inviteId);
                break;
            case 'lobby':
                if (launch.error) {
                    setLobbyError(launch.error);
                }
                break;
        }
    }, [launch, launchHandled, startDuel, join]);

    // Telegram's own back button on every sub-screen; the lobby and the duel have nothing to go back to.
    useEffect(() => {
        if (route.name === 'duel' || route.name === 'lobby') {
            telegram.backButton(false);
            return;
        }
        const back =
            route.name === 'settings'
                ? () => navigate({ name: 'profile' })
                : () => navigate({ name: 'lobby' });
        telegram.backButton(true, back);
        return () => telegram.backButton(false);
    }, [route, telegram]);

    const createInvite = async () => {
        try {
            const created = await api.createInvite();
            setLobbyError(undefined);
            setWaitingFor(created.inviteId);
            if (telegram.inTelegram) {
                // One tap: the share sheet opens right away, the waiting screen is already behind it.
                telegram.openTelegramLink(
                    shareUrl(inviteLink(created.inviteId, links), t('waiting.shareText')),
                );
            }
        } catch (error) {
            setLobbyError(t('lobby.errors.createInvite', { error: describeError(error) }));
        }
        navigate({ name: 'lobby' });
    };

    if (launch.phase === 'loading' || (!launchHandled && launch.phase !== 'lobby')) {
        return <p class="notice">{t('app.loading')}</p>;
    }
    if (route.name === 'duel') {
        return table(route.duelId, () => navigate({ name: 'lobby' }));
    }

    const screen = (() => {
        switch (route.name) {
            case 'lobby':
                return waitingFor ? (
                    <Waiting
                        inviteId={waitingFor}
                        api={api}
                        pollMs={pollMs}
                        link={inviteLink(waitingFor, links)}
                        onShare={(link) => telegram.openTelegramLink(shareUrl(link, t('waiting.shareText')))}
                        onAccepted={startDuel}
                        onExpired={() => {
                            setWaitingFor(undefined);
                            setLobbyError(t('lobby.errors.waitExpired'));
                        }}
                        onCancel={() => setWaitingFor(undefined)}
                    />
                ) : (
                    <Lobby player={player} error={lobbyError} onInvite={createInvite} onJoin={join} />
                );
            case 'friends':
                return <Friends onInvite={createInvite} />;
            case 'shop':
                return <Shop />;
            case 'profile':
                return (
                    <Profile
                        player={player}
                        api={api}
                        onOpenSettings={() => navigate({ name: 'settings' })}
                    />
                );
            case 'settings':
                return <Settings />;
        }
    })();

    return (
        <>
            {screen}
            {TOP_LEVEL.has(route.name) && (
                <BottomNav
                    active={route.name as 'lobby' | 'friends' | 'shop' | 'profile'}
                    onSelect={(name) => navigate({ name })}
                />
            )}
        </>
    );
}
