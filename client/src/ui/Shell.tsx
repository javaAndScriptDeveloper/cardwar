import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { SignedInPlayer } from '../auth/session';
import { t } from '../i18n';
import { navigate, TOP_LEVEL, useRoute } from '../router';
import { inviteLink, shareUrl, type LinkConfig } from '../telegram/links';
import type { Telegram } from '../telegram/webapp';
import { reasonMessage } from '../game/reasons';
import { refreshWallet, wallet } from '../state/wallet';
import { describeError } from './errors';
import { Friends } from './friends/Friends';
import { BottomNav } from './kit';
import { Lobby } from './lobby/Lobby';
import { Searching } from './lobby/Searching';
import { StakePicker } from './lobby/StakePicker';
import { Waiting } from './lobby/Waiting';
import { Profile } from './profile/Profile';
import { Settings } from './settings/Settings';
import { Shop } from './shop/Shop';
import { useLaunch } from './useLaunch';

export type ShellApi = Pick<
    ApiClient,
    | 'activeDuels'
    | 'pendingInvite'
    | 'createInvite'
    | 'inviteStatus'
    | 'acceptInvite'
    | 'history'
    | 'wallet'
    | 'claimDailyBonus'
    | 'transactions'
    | 'enterMatchmaking'
    | 'matchmakingStatus'
    | 'leaveMatchmaking'
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
        // A rule with its own sentence (INSUFFICIENT_COINS at acceptance) says more than the bare status.
        const reason = reasonMessage(error.reason);
        if (reason) {
            return reason;
        }
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
    const [waitingFor, setWaitingFor] = useState<{ inviteId: string; stake: number }>();
    // Quick-match search in progress; like the invite, a reload recovers it through useLaunch.
    const [searching, setSearching] = useState<{ stake: number; since: string }>();
    /** What the open stake picker is for: an invite to a friend or a quick match with anyone. */
    const [pickingStake, setPickingStake] = useState<'invite' | 'match'>();
    const [creating, setCreating] = useState(false);
    const [lobbyError, setLobbyError] = useState<string>();
    const [launchHandled, setLaunchHandled] = useState(false);

    const startDuel = useCallback((duelId: string) => {
        setWaitingFor(undefined);
        setSearching(undefined);
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
                setWaitingFor({ inviteId: launch.inviteId, stake: launch.stake });
                break;
            case 'searching':
                setSearching({ stake: launch.stake, since: launch.since });
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

    // The balance moves at sign-in, when a duel ends (escrow, payout, refund) and on a bonus claim. Re-reading it
    // whenever the player is outside a duel covers the first two without the duel screen knowing about coins.
    const inDuel = route.name === 'duel';
    useEffect(() => {
        if (!inDuel) {
            void refreshWallet(api);
        }
    }, [inDuel, api]);

    const claimBonus = async () => {
        try {
            wallet.value = await api.claimDailyBonus();
        } catch (error) {
            // 409: taken already (a double tap, another device). The fresh wallet says so; nothing to explain.
            if (!(error instanceof ApiError && error.status === 409)) {
                setLobbyError(t('lobby.errors.claimBonus', { error: describeError(error) }));
            }
            await refreshWallet(api);
        }
    };
    const bonusDue = useCallback(() => void refreshWallet(api), [api]);

    const openStakePicker = (purpose: 'invite' | 'match') => {
        setPickingStake(purpose);
        navigate({ name: 'lobby' });
        void refreshWallet(api);
    };

    const createInvite = async (stake: number) => {
        setPickingStake(undefined);
        setCreating(true);
        try {
            const created = await api.createInvite(stake);
            setLobbyError(undefined);
            setWaitingFor({ inviteId: created.inviteId, stake: created.stake ?? stake });
            if (telegram.inTelegram) {
                // One tap: the share sheet opens right away, the waiting screen is already behind it.
                telegram.openTelegramLink(
                    shareUrl(inviteLink(created.inviteId, links), t('waiting.shareText')),
                );
            }
        } catch (error) {
            setLobbyError(
                (error instanceof ApiError && reasonMessage(error.reason)) ||
                    t('lobby.errors.createInvite', { error: describeError(error) }),
            );
        } finally {
            setCreating(false);
        }
        navigate({ name: 'lobby' });
    };

    const findMatch = async (stake: number) => {
        setPickingStake(undefined);
        setCreating(true);
        try {
            const entry = await api.enterMatchmaking(stake);
            setLobbyError(undefined);
            if (entry.status === 'MATCHED' && entry.duelId) {
                startDuel(entry.duelId);
                return;
            }
            setSearching({ stake: entry.stake, since: entry.since });
        } catch (error) {
            setLobbyError(
                (error instanceof ApiError && reasonMessage(error.reason)) ||
                    t('lobby.errors.quickMatch', { error: describeError(error) }),
            );
        } finally {
            setCreating(false);
        }
        navigate({ name: 'lobby' });
    };

    const searchExpired = useCallback(() => {
        setSearching(undefined);
        setLobbyError(t('lobby.errors.searchExpired'));
    }, []);

    // The server may have paired us a moment before the leave landed; the opponent would then sit at a table
    // nobody comes to, so look for that duel once more after leaving.
    const cancelSearch = async () => {
        setSearching(undefined);
        await api.leaveMatchmaking().catch(() => undefined);
        const active = await api.activeDuels().catch(() => []);
        const duel = active[0];
        if (duel) {
            startDuel(duel.duelId);
        }
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
                if (searching) {
                    return (
                        <Searching
                            stake={searching.stake}
                            since={searching.since}
                            api={api}
                            pollMs={pollMs}
                            onMatched={startDuel}
                            onExpired={searchExpired}
                            onCancel={() => void cancelSearch()}
                        />
                    );
                }
                return waitingFor ? (
                    <Waiting
                        inviteId={waitingFor.inviteId}
                        stake={waitingFor.stake}
                        api={api}
                        pollMs={pollMs}
                        link={inviteLink(waitingFor.inviteId, links)}
                        onShare={(link) => telegram.openTelegramLink(shareUrl(link, t('waiting.shareText')))}
                        onAccepted={startDuel}
                        onExpired={() => {
                            setWaitingFor(undefined);
                            setLobbyError(t('lobby.errors.waitExpired'));
                        }}
                        onCancel={() => setWaitingFor(undefined)}
                    />
                ) : (
                    <Lobby
                        player={player}
                        error={lobbyError}
                        wallet={wallet.value}
                        creating={creating}
                        onInvite={() => openStakePicker('invite')}
                        onQuickMatch={() => openStakePicker('match')}
                        onJoin={join}
                        onClaimBonus={claimBonus}
                        onBonusDue={bonusDue}
                    />
                );
            case 'friends':
                return <Friends onInvite={() => openStakePicker('invite')} />;
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
            <StakePicker
                open={pickingStake !== undefined}
                balance={wallet.value?.balance}
                onPick={(stake) => void (pickingStake === 'match' ? findMatch(stake) : createInvite(stake))}
                onClose={() => setPickingStake(undefined)}
            />
            {TOP_LEVEL.has(route.name) && (
                <BottomNav
                    active={route.name as 'lobby' | 'friends' | 'shop' | 'profile'}
                    onSelect={(name) => navigate({ name })}
                />
            )}
        </>
    );
}
