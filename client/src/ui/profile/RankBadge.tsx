import type { ProgressView, Rank } from '../../api/types';
import { has, t } from '../../i18n';

/** The rank's Ukrainian name; a rank the catalog does not know (a newer server) shows as its code. */
export function rankName(rank: Rank | string): string {
    return has(`progress.rank.${rank}`) ? t(`progress.rank.${rank}`) : rank;
}

export function RankBadge({ progress }: { progress: ProgressView }) {
    return (
        <span
            class={`badge accent rank-badge ${progress.rank.toLowerCase()}`}
            data-testid="rank-badge"
            data-rank={progress.rank}
        >
            {rankName(progress.rank)}
        </span>
    );
}

/** XP towards the next rank; full at the top rank, where there is nothing left to reach. */
export function XpBar({ progress }: { progress: ProgressView }) {
    const next = progress.nextRankXp;
    const percent = next === null ? 100 : Math.min(100, Math.round((100 * progress.xp) / next));
    return (
        <div class="xp-bar" data-testid="xp-bar" data-xp={progress.xp} data-next={next ?? undefined}>
            <div class="bar" aria-hidden="true">
                <i class="fill" style={{ width: `${percent}%` }} />
            </div>
            <span class="notice">
                {next === null
                    ? t('progress.xpMax', { xp: progress.xp })
                    : t('progress.xpBar', { xp: progress.xp, next })}
            </span>
        </div>
    );
}
