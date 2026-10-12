import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { SignedInPlayer } from '../auth/session';
import { t } from '../i18n';
import { navigate, TOP_LEVEL, useRoute } from '../router';
import { inviteLink, shareUrl, type LinkConfig } from '../telegram/links';
import type { Telegram } from '../telegram/webapp';
import { reasonMessage } from '../game/reasons';
import { refreshLoadout } from '../state/loadout';
import { refreshWallet, wallet } from '../state/wallet';
import { describeError } from './errors';
import { Friends } from './friends/Friends';
import { BottomNav } from './kit';
import { Lobby } from './lobby/Lobby';
import { OfflineBanner } from './OfflineBanner';
import { Searching } from './lobby/Searching';
import { StakePicker } from './lobby/StakePicker';
import { Waiting } from './lobby/Waiting';
import { Profile } from './profile/Profile';
import { Settings } from './settings/Settings';
import { Shop } from './shop/Shop';
import { useLaunch } from './useLaunch';
import type { ChallengeView, FriendView, OutgoingChallengeView, InviteView } from '../api/types';

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
    | 'shop'
    | 'buyItem'
    | 'equipItem'
    | 'starsInvoice'
    | 'loadout'
    | 'friends'
    | 'challenge'
    | 'challenges'
    | 'outgoingChallenges'
    | 'declineInvite'
>;

interface Props {
    player: SignedInPlayer;
    api: ShellApi;
    telegram: Telegram;
    /** Invite id the app was opened with (Telegram start_param, or ?invite= from the bot's Join button / dev shim). */
    invite: string | undefined;
    links: LinkConfig;
    table: (
        duelId: string,
        exit: () => void,
        rematch: {
            onRematchSent: (invite: InviteView, opponentName: string) => void;
            onDuel: (duelId: string) => void;
        },
    ) => ComponentChildren;
    pollMs?: number;
    /** How often incoming challenges are re-read while the lobby or friends screen is open. */
    challengePollMs?: number;
    /** How long the app must be offline before the banner says so; tests set 0. */
    offlineGraceMs?: number;
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
export function Shell({
    player,
    api,
    telegram,
    invite,
    links,
    table,
    pollMs = 2000,
    challengePollMs = 10_000,
    offlineGraceMs,
}: Props) {
    const route = useRoute();
    const launch = useLaunch(api, invite);
    // The invite being waited on survives tab changes; a reload recovers it through useLaunch.
    // `challengee` names the friend a challenge went to; a plain invite has none and can be shared instead.
    const [waitingFor, setWaitingFor] = useState<{ inviteId: string; stake: number; challengee?: string }>();
    // Quick-match search in progress; like the invite, a reload recovers it through useLaunch.
    const [searching, setSearching] = useState<{ stake: number; since: string }>();
    /** What the open stake picker is for: an invite by link, a quick match with anyone, or a challenge to a friend. */
    const [pickingStake, setPickingStake] = useState<'invite' | 'match' | 'challenge'>();
    const [challengeTarget, setChallengeTarget] = useState<FriendView>();
    const [challenges, setChallenges] = useState<ChallengeView[]>([]);
    const [outgoing, setOutgoing] = useState<OutgoingChallengeView[]>([]);
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
                setWaitingFor({
                    inviteId: launch.inviteId,
                    stake: launch.stake,
                    // After a reload the friend's name is not known, only that the invite was a challenge.
                    ...(launch.invitee !== undefined && { challengee: t('duel.opponent') }),
                });
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

    // The server loadout is the deck's source of truth once signed in; read it once per sign-in, then the shop and
    // the settings picker keep it current with their equip answers.
    useEffect(() => {
        void refreshLoadout(api);
    }, [api]);

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

    // Challenges addressed to this player, polled only where they are shown (the lobby badge and the friends inbox).
    const watchChallenges = route.name === 'lobby' || route.name === 'friends';
    const reloadChallenges = useCallback(async () => {
        try {
            setChallenges(await api.challenges());
        } catch {
            // Keep the last list; the next poll tries again.
        }
    }, [api]);
    useEffect(() => {
        if (!watchChallenges) {
            return;
        }
        void reloadChallenges();
        const timer = setInterval(() => void reloadChallenges(), challengePollMs);
        return () => clearInterval(timer);
    }, [watchChallenges, reloadChallenges, challengePollMs]);

    // Challenges this player sent, with how each stands; polled only on the friends screen, where they are shown.
    const onFriends = route.name === 'friends';
    const reloadOutgoing = useCallback(async () => {
        try {
            setOutgoing(await api.outgoingChallenges());
        } catch {
            // Keep the last list; the next poll tries again.
        }
    }, [api]);
    useEffect(() => {
        if (!onFriends) {
            return;
        }
        void reloadOutgoing();
        const timer = setInterval(() => void reloadOutgoing(), challengePollMs);
        return () => clearInterval(timer);
    }, [onFriends, reloadOutgoing, challengePollMs]);

    const declineChallenge = async (inviteId: string) => {
        setChallenges((current) => current.filter((challenge) => challenge.inviteId !== inviteId));
        try {
            await api.declineInvite(inviteId);
        } catch (error) {
            setLobbyError(t('lobby.errors.decline', { error: describeError(error) }));
        }
        await reloadChallenges();
    };

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

    const challengeFriend = async (stake: number) => {
        const friend = challengeTarget;
        setPickingStake(undefined);
        if (!friend) {
            return;
        }
        setCreating(true);
        try {
            const created = await api.challenge(friend.playerId, stake);
            setLobbyError(undefined);
            setWaitingFor({
                inviteId: created.inviteId,
                stake: created.stake ?? stake,
                challengee: friend.displayName,
            });
            void reloadOutgoing();
        } catch (error) {
            setLobbyError(
                (error instanceof ApiError && reasonMessage(error.reason)) ||
                    t('lobby.errors.challenge', { error: describeError(error) }),
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

    const banner = <OfflineBanner {...(offlineGraceMs !== undefined && { graceMs: offlineGraceMs })} />;
    if (launch.phase === 'loading' || (!launchHandled && launch.phase !== 'lobby')) {
        return (
            <>
                {banner}
                <p class="notice">{t('app.loading')}</p>
            </>
        );
    }
    if (route.name === 'duel') {
        return (
            <>
                {banner}
                {table(route.duelId, () => navigate({ name: 'lobby' }), {
                    onRematchSent: (invite, opponentName) => {
                        setWaitingFor({
                            inviteId: invite.inviteId,
                            stake: invite.stake,
                            challengee: opponentName,
                        });
                        navigate({ name: 'lobby' });
                    },
                    onDuel: startDuel,
                })}
            </>
        );
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
                        challengee={waitingFor.challengee}
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
                return (
                    <Friends
                        api={api}
                        challenges={challenges}
                        outgoing={outgoing}
                        onChallenge={(friend) => {
                            setChallengeTarget(friend);
                            setPickingStake('challenge');
                            void refreshWallet(api);
                        }}
                        onAccept={join}
                        onDecline={declineChallenge}
                        onInvite={() => openStakePicker('invite')}
                    />
                );
            case 'shop':
                return <Shop api={api} telegram={telegram} />;
            case 'profile':
                return (
                    <Profile
                        player={player}
                        api={api}
                        onOpenSettings={() => navigate({ name: 'settings' })}
                    />
                );
            case 'settings':
                return (
                    <Settings
                        api={api}
                        inTelegram={telegram.inTelegram}
                        onOpenShop={() => navigate({ name: 'shop' })}
                    />
                );
        }
    })();

    return (
        <>
            {banner}
            {screen}
            <StakePicker
                open={pickingStake !== undefined}
                balance={wallet.value?.balance}
                onPick={(stake) =>
                    void (pickingStake === 'match'
                        ? findMatch(stake)
                        : pickingStake === 'challenge'
                          ? challengeFriend(stake)
                          : createInvite(stake))
                }
                onClose={() => setPickingStake(undefined)}
            />
            {TOP_LEVEL.has(route.name) && (
                <BottomNav
                    active={route.name as 'lobby' | 'friends' | 'shop' | 'profile'}
                    onSelect={(name) => navigate({ name })}
                    friendsBadge={challenges.length}
                />
            )}
        </>
    );
}
