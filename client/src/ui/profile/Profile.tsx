import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../../api/client';
import type { CoinTransactionView, DuelHistoryEntry } from '../../api/types';
import type { SignedInPlayer } from '../../auth/session';
import { forms, plural, t } from '../../i18n';
import { describeError } from '../errors';
import { Avatar, Badge, CoinAmount, ListRow } from '../kit';

interface Props {
    player: SignedInPlayer;
    api: Pick<ApiClient, 'history' | 'transactions'>;
    onOpenSettings: () => void;
}

type History =
    { kind: 'loading' } | { kind: 'ready'; entries: DuelHistoryEntry[] } | { kind: 'failed'; error: string };

type Transactions = { kind: 'loading' } | { kind: 'ready'; rows: CoinTransactionView[] } | { kind: 'failed' };

const TONE = { WON: 'success', LOST: 'danger', DRAW: 'neutral' } as const;

const WHEN = new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
});

/** Who you are, how it has been going, and where your coins came from and went. */
export function Profile({ player, api, onOpenSettings }: Props) {
    const [history, setHistory] = useState<History>({ kind: 'loading' });
    const [transactions, setTransactions] = useState<Transactions>({ kind: 'loading' });
    const name = player.displayName ?? player.username;

    useEffect(() => {
        let cancelled = false;
        api.transactions()
            .then((rows) => !cancelled && setTransactions({ kind: 'ready', rows }))
            .catch(() => !cancelled && setTransactions({ kind: 'failed' }));
        return () => {
            cancelled = true;
        };
    }, [api]);

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
    const winRate = entries.length > 0 ? Math.round((100 * wins) / entries.length) : undefined;
    // Gross winnings: what staked wins brought in, not the net after losses (the ledger below shows that).
    const coinsWon = entries.reduce((sum, entry) => sum + Math.max(0, entry.coinDelta), 0);

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
                <div class="stat">
                    <span class="value" data-testid="stat-winrate" data-value={winRate}>
                        {winRate === undefined ? '—' : `${winRate}%`}
                    </span>
                    <span class="notice">{t('profile.winRate')}</span>
                </div>
                <div class="stat">
                    <span class="value">
                        <CoinAmount amount={coinsWon} data-testid="stat-coins-won" />
                    </span>
                    <span class="notice">{t('profile.coinsWon')}</span>
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
                    leading={
                        <Avatar
                            name={entry.opponentDisplayName ?? entry.opponentUsername}
                            photoUrl={entry.opponentPhotoUrl}
                            size={36}
                        />
                    }
                    title={t('profile.vs', { name: entry.opponentDisplayName ?? entry.opponentUsername })}
                    subtitle={t('profile.moves', {
                        n: entry.moveCount,
                        moves: plural(entry.moveCount, forms('profile.movesForms')),
                    })}
                    trailing={
                        <>
                            {entry.stake > 0 && (
                                <CoinAmount amount={entry.coinDelta} signed data-testid="history-delta" />
                            )}
                            <Badge tone={TONE[entry.result]}>{t(`duel.result.${entry.result}`)}</Badge>
                        </>
                    }
                />
            ))}
            <h2>{t('profile.coins')}</h2>
            {transactions.kind === 'failed' && <p class="notice">{t('profile.transactionsFailed')}</p>}
            {transactions.kind === 'ready' && transactions.rows.length === 0 && (
                <p class="notice">{t('profile.noTransactions')}</p>
            )}
            {transactions.kind === 'ready' &&
                transactions.rows.map((row, index) => (
                    <div key={`${row.createdAt}-${index}`} data-testid="tx-row" data-kind={row.kind}>
                        <ListRow
                            title={t(`profile.tx.${row.kind}`)}
                            subtitle={WHEN.format(new Date(row.createdAt))}
                            trailing={<CoinAmount amount={row.amount} signed />}
                        />
                    </div>
                ))}
        </section>
    );
}
