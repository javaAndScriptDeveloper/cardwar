import type { LeaderboardEntry } from '../../api/types';
import { forms, plural, t } from '../../i18n';
import { Avatar, CoinAmount, ListRow } from '../kit';

interface Props {
    /** Undefined while loading; the server's order is kept. */
    entries: LeaderboardEntry[] | undefined;
    failed?: boolean;
}

/** «Топ друзів»: the caller among their friends by coins won this week. An empty board is a nudge to play. */
export function Leaderboard({ entries, failed = false }: Props) {
    return (
        <section class="leaderboard" data-testid="leaderboard">
            <h2>{t('leaderboard.title')}</h2>
            {failed && <p class="notice">{t('profile.transactionsFailed')}</p>}
            {entries && entries.length <= 1 && !failed && <p class="notice">{t('leaderboard.empty')}</p>}
            {entries &&
                entries.length > 1 &&
                entries.map((entry, index) => (
                    <div
                        key={entry.playerId}
                        class={`leaderboard-row${entry.you ? ' you' : ''}`}
                        data-testid="leaderboard-row"
                        data-player={entry.playerId}
                        data-you={String(entry.you)}
                    >
                        <ListRow
                            leading={
                                <>
                                    <span class="place">{index + 1}</span>
                                    <Avatar
                                        name={entry.player.displayName}
                                        photoUrl={entry.player.photoUrl}
                                        size={36}
                                    />
                                </>
                            }
                            title={
                                entry.you
                                    ? `${entry.player.displayName} (${t('leaderboard.you')})`
                                    : entry.player.displayName
                            }
                            subtitle={t('leaderboard.wins', {
                                n: entry.wins,
                                wins: plural(entry.wins, forms('leaderboard.winsForms')),
                            })}
                            trailing={<CoinAmount amount={entry.coinsWon} />}
                        />
                    </div>
                ))}
        </section>
    );
}
