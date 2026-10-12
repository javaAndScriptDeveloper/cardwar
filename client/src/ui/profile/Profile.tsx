import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../../api/client';
import type { DuelHistoryEntry } from '../../api/types';
import type { SignedInPlayer } from '../../auth/session';
import { forms, plural, t } from '../../i18n';
import { describeError } from '../errors';
import { Avatar, Badge, ListRow } from '../kit';

interface Props {
    player: SignedInPlayer;
    api: Pick<ApiClient, 'history'>;
    onOpenSettings: () => void;
}

type History =
    { kind: 'loading' } | { kind: 'ready'; entries: DuelHistoryEntry[] } | { kind: 'failed'; error: string };

const TONE = { WON: 'success', LOST: 'danger', DRAW: 'neutral' } as const;

/** Who you are and how it has been going; coin deltas join the rows with MVP 2. */
export function Profile({ player, api, onOpenSettings }: Props) {
    const [history, setHistory] = useState<History>({ kind: 'loading' });
    const name = player.displayName ?? player.username;

    useEffect(() => {
        let cancelled = false;
        api.history()
            .then((entries) => !cancelled && setHistory({ kind: 'ready', entries }))
            .catch(
                (error: unknown) => !cancelled && setHistory({ kind: 'failed', error: describeError(error) }),
            );
        return () => {
            cancelled = true;
        };
    }, [api]);

    const entries = history.kind === 'ready' ? history.entries : [];
    const wins = entries.filter((entry) => entry.result === 'WON').length;

    return (
        <section class="lobby" data-testid="profile-screen">
            <header class="lobby-header">
                <Avatar name={name} photoUrl={player.photoUrl} size={56} data-testid="profile-avatar" />
                <div>
                    <h1>{name}</h1>
                    <p class="notice">@{player.username}</p>
                </div>
            </header>
            <div class="stats">
                <div class="stat">
                    <span class="value" data-testid="stat-games">
                        {entries.length}
                    </span>
                    <span class="notice">{t('profile.games')}</span>
                </div>
                <div class="stat">
                    <span class="value" data-testid="stat-wins">
                        {wins}
                    </span>
                    <span class="notice">{t('profile.wins')}</span>
                </div>
            </div>
            <ListRow
                title={t('profile.settings')}
                trailing="›"
                onClick={onOpenSettings}
                data-testid="open-settings"
            />
            <h2>{t('profile.history')}</h2>
            {history.kind === 'failed' && (
                <p class="error" role="alert">
                    {t('profile.loadFailed', { error: history.error })}
                </p>
            )}
            {history.kind === 'ready' && entries.length === 0 && (
                <p class="notice">{t('profile.noHistory')}</p>
            )}
            {entries.map((entry) => (
                <ListRow
                    key={entry.duelId}
                    data-testid="history-row"
                    leading={<Avatar name={entry.opponentUsername} size={36} />}
                    title={t('profile.vs', { name: entry.opponentUsername })}
                    subtitle={t('profile.moves', {
                        n: entry.moveCount,
                        moves: plural(entry.moveCount, forms('profile.movesForms')),
                    })}
                    trailing={<Badge tone={TONE[entry.result]}>{t(`duel.result.${entry.result}`)}</Badge>}
                />
            ))}
        </section>
    );
}
