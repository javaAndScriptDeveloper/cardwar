import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../../api/client';
import type { ChallengeView, FriendView, OutgoingChallengeView } from '../../api/types';
import { t } from '../../i18n';
import { describeError } from '../errors';
import { Avatar, Badge, Button, CoinAmount } from '../kit';

interface Props {
    /** Pause between load attempts; tests shorten it. */
    retryMs?: number;
    api: Pick<ApiClient, 'friends'>;
    /** Open challenges addressed to you; the shell polls them so the nav badge and this inbox agree. */
    challenges: readonly ChallengeView[];
    /** Challenges you sent, newest first, with how each stands; the shell reloads them after a new one. */
    outgoing: readonly OutgoingChallengeView[];
    /** Opens the stake picker for a challenge to this friend. */
    onChallenge: (friend: FriendView) => void;
    onAccept: (inviteId: string) => Promise<void>;
    onDecline: (inviteId: string) => Promise<void>;
    onInvite: () => void;
}

type List =
    { kind: 'loading' } | { kind: 'ready'; friends: FriendView[] } | { kind: 'failed'; error: string };

const TONE: Record<OutgoingChallengeView['status'], 'neutral' | 'accent' | 'success' | 'danger'> = {
    WAITING: 'accent',
    ACCEPTED: 'success',
    DECLINED: 'danger',
    EXPIRED: 'neutral',
};

/** A switch of literal keys, so the catalog test sees every one of them used. */
function statusLabel(status: OutgoingChallengeView['status']): string {
    switch (status) {
        case 'WAITING':
            return t('friends.status.waiting');
        case 'ACCEPTED':
            return t('friends.status.accepted');
        case 'DECLINED':
            return t('friends.status.declined');
        case 'EXPIRED':
            return t('friends.status.expired');
    }
}

const WHEN = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });

/** Everybody you have played (friends are derived from results, not added), and challenges waiting for you. */
/** Attempts before the list is reported as unavailable, and the pause between them. */
const LOAD_ATTEMPTS = 4;

export function Friends({
    api,
    challenges,
    outgoing,
    onChallenge,
    onAccept,
    onDecline,
    onInvite,
    retryMs = 1500,
}: Props) {
    const [list, setList] = useState<List>({ kind: 'loading' });
    const [busy, setBusy] = useState<string>();

    // Right after a fast duel the per-player rate limit may still refuse a request; a failed load is retried a few
    // times before the screen says so, as the duel screen does for its re-fetches.
    useEffect(() => {
        let live = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = (attempt: number) => {
            api.friends()
                .then((friends) => live && setList({ kind: 'ready', friends }))
                .catch((error: unknown) => {
                    if (!live) {
                        return;
                    }
                    if (attempt < LOAD_ATTEMPTS) {
                        timer = setTimeout(() => load(attempt + 1), retryMs);
                    } else {
                        setList({ kind: 'failed', error: describeError(error) });
                    }
                });
        };
        load(1);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [api, retryMs]);

    const answer = async (inviteId: string, action: (id: string) => Promise<void>) => {
        setBusy(inviteId);
        try {
            await action(inviteId);
        } finally {
            setBusy(undefined);
        }
    };

    return (
        <section class="lobby" data-testid="friends-screen">
            <h1>{t('friends.title')}</h1>
            {challenges.length > 0 && (
                <div class="panel challenges" data-testid="challenges">
                    <h2>{t('friends.challenges')}</h2>
                    {challenges.map((challenge) => (
                        <div
                            key={challenge.inviteId}
                            class="list-row"
                            data-testid="challenge-row"
                            data-invite={challenge.inviteId}
                            data-stake={challenge.stake}
                        >
                            <span class="list-row-leading">
                                <Avatar
                                    name={challenge.from.displayName}
                                    photoUrl={challenge.from.photoUrl}
                                    size={36}
                                />
                            </span>
                            <span class="list-row-text">
                                <span class="list-row-title">{challenge.from.displayName}</span>
                                <span class="list-row-subtitle">
                                    {challenge.stake > 0 ? (
                                        <CoinAmount amount={challenge.stake} />
                                    ) : (
                                        t('friends.friendly')
                                    )}
                                </span>
                            </span>
                            <span class="list-row-trailing">
                                <Button
                                    variant="ghost"
                                    disabled={busy !== undefined}
                                    onClick={() => void answer(challenge.inviteId, onDecline)}
                                    data-testid={`decline-${challenge.inviteId}`}
                                >
                                    {t('friends.decline')}
                                </Button>
                                <Button
                                    variant="primary"
                                    busy={busy === challenge.inviteId}
                                    disabled={busy !== undefined}
                                    onClick={() => void answer(challenge.inviteId, onAccept)}
                                    data-testid={`accept-${challenge.inviteId}`}
                                >
                                    {t('friends.accept')}
                                </Button>
                            </span>
                        </div>
                    ))}
                </div>
            )}
            {outgoing.length > 0 && (
                <div class="panel outgoing" data-testid="outgoing">
                    <h2>{t('friends.outgoing')}</h2>
                    {outgoing.map((sent) => (
                        <div
                            key={sent.inviteId}
                            class="list-row"
                            data-testid="outgoing-row"
                            data-invite={sent.inviteId}
                            data-player={sent.to.playerId}
                            data-status={sent.status}
                            data-stake={sent.stake}
                        >
                            <span class="list-row-leading">
                                <Avatar name={sent.to.displayName} size={36} />
                            </span>
                            <span class="list-row-text">
                                <span class="list-row-title">{sent.to.displayName}</span>
                                <span class="list-row-subtitle">
                                    {sent.stake > 0 ? (
                                        <CoinAmount amount={sent.stake} />
                                    ) : (
                                        t('friends.friendly')
                                    )}
                                </span>
                            </span>
                            <span class="list-row-trailing" data-testid="outgoing-status">
                                <Badge tone={TONE[sent.status]}>{statusLabel(sent.status)}</Badge>
                            </span>
                        </div>
                    ))}
                </div>
            )}
            {list.kind === 'failed' && (
                <p class="error" role="alert">
                    {t('friends.loadFailed', { error: list.error })}
                </p>
            )}
            {list.kind === 'ready' && list.friends.length === 0 && (
                <div class="empty-state">
                    <p class="notice">{t('friends.empty')}</p>
                    <Button variant="primary" onClick={onInvite} data-testid="friends-invite">
                        {t('friends.invite')}
                    </Button>
                </div>
            )}
            {list.kind === 'ready' &&
                list.friends.map((friend) => (
                    <div
                        key={friend.playerId}
                        class="list-row"
                        data-testid="friend-row"
                        data-player={friend.playerId}
                    >
                        <span class="list-row-leading">
                            <Avatar name={friend.displayName} photoUrl={friend.photoUrl} size={36} />
                        </span>
                        <span class="list-row-text">
                            <span class="list-row-title">
                                {friend.displayName}
                                {friend.handle && (
                                    <span class="list-row-handle" data-testid="friend-handle">
                                        {t('friends.handle', { handle: friend.handle })}
                                    </span>
                                )}
                            </span>
                            <span class="list-row-subtitle">
                                <span
                                    class="record"
                                    data-testid="friend-record"
                                    data-won={friend.won}
                                    data-lost={friend.lost}
                                    title={t('friends.recordHint')}
                                >
                                    {t('friends.record', { won: friend.won, lost: friend.lost })}
                                </span>
                                {' · '}
                                <span data-testid="friend-last-played">
                                    {t('friends.lastPlayed', {
                                        date: WHEN.format(new Date(friend.lastPlayedAt)),
                                    })}
                                </span>
                            </span>
                        </span>
                        <span class="list-row-trailing">
                            <Button
                                variant="primary"
                                onClick={() => onChallenge(friend)}
                                data-testid={`challenge-${friend.playerId}`}
                            >
                                {t('friends.challenge')}
                            </Button>
                        </span>
                    </div>
                ))}
        </section>
    );
}
