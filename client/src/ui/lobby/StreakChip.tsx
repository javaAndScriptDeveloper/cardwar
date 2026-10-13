import type { ProgressView } from '../../api/types';
import { t } from '../../i18n';

/** The flame on a win streak: how long it is and what the next staked win pays for it. Nothing without one. */
export function StreakChip({ progress }: { progress: ProgressView }) {
    if (progress.winStreak < 1) {
        return null;
    }
    return (
        <span class="streak-chip" data-testid="streak-chip" data-streak={progress.winStreak}>
            {t('streak.chip', { n: progress.winStreak, percent: progress.streakBonusPercent })}
        </span>
    );
}
