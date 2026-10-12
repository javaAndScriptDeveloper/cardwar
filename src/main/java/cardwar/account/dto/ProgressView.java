package cardwar.account.dto;

/**
 * Progress as other modules and the client see it. Read-only: only the account module writes these numbers.
 * {@code nextRankXp} is null at the top rank; {@code streakBonusPercent} is what the next staked win pays on top of
 * the pot, {@code 10 * min(winStreak, 5)}.
 */
public record ProgressView(
        int duelsPlayed,
        int duelsWon,
        long currencyBalance,
        int winStreak,
        int bestWinStreak,
        int xp,
        Rank rank,
        Integer nextRankXp,
        int streakBonusPercent) {

    public static final int MAX_BONUS_STREAK = 5;

    public static int bonusPercentFor(int winStreak) {
        return 10 * Math.min(winStreak, MAX_BONUS_STREAK);
    }
}
