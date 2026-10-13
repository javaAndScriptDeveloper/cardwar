import type { MissionView, ProgressView } from '../../api/types';
import { t } from '../../i18n';
import { missionTitle } from '../lobby/Missions';
import { rankName } from './RankBadge';

interface Props {
    /** Progress read before the duel; without it only the streak itself can be shown, never a gain. */
    before?: ProgressView | undefined;
    after: ProgressView;
    missionsBefore?: MissionView[] | undefined;
    missionsAfter?: MissionView[] | undefined;
}

/**
 * What one duel did to the player's progress, for the result screen: the streak as it stands (or that it broke),
 * the XP gained, a rank-up when a threshold was crossed, and every mission the duel moved.
 */
export function ProgressLines({ before, after, missionsBefore, missionsAfter }: Props) {
    const gained = before ? after.xp - before.xp : 0;
    const rankedUp = before !== undefined && before.rank !== after.rank;
    const moved = (missionsAfter ?? []).filter(
        (mission) =>
            (missionsBefore?.find((row) => row.code === mission.code)?.progress ?? 0) !== mission.progress,
    );
    return (
        <div class="progress-lines" data-testid="progress-lines">
            {after.winStreak > 0 ? (
                <span class="line streak" data-testid="streak-line" data-streak={after.winStreak}>
                    {t('streak.line', { n: after.winStreak })}
                </span>
            ) : (
                before &&
                before.winStreak > 0 && (
                    <span class="line streak broken" data-testid="streak-line" data-streak={0}>
                        {t('streak.broken')}
                    </span>
                )
            )}
            {gained > 0 && (
                <span class="line xp" data-testid="xp-line" data-gained={gained}>
                    {t('progress.xpGained', { n: gained })}
                </span>
            )}
            {rankedUp && (
                <span class="line rank-up" data-testid="rank-up" data-rank={after.rank}>
                    {t('progress.rankUp', { rank: rankName(after.rank) })}
                </span>
            )}
            {moved.map((mission) => (
                <span
                    key={mission.code}
                    class="line mission"
                    data-testid="mission-line"
                    data-code={mission.code}
                    data-progress={mission.progress}
                >
                    {t('missions.changed', {
                        title: missionTitle(mission.code),
                        progress: mission.progress,
                        target: mission.target,
                    })}
                </span>
            ))}
        </div>
    );
}
