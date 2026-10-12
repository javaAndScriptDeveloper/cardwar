package cardwar.wallet.dto;

/**
 * The daily missions, the same three for everybody every Kyiv day. Defined in code rather than in a table because
 * the set is fixed; a season with rotating missions would move this to the catalog.
 */
public enum MissionCode {
    PLAY_3(3, 60),
    WIN_2(2, 120),
    STAKED_WIN_1(1, 150);

    /** The smallest table stake; a staked win is one at any real stake. */
    private static final long MIN_STAKE = 100;

    private final int target;
    private final long reward;

    MissionCode(int target, long reward) {
        this.target = target;
        this.reward = reward;
    }

    public int target() {
        return target;
    }

    public long reward() {
        return reward;
    }

    /** Whether a finished duel with this outcome for the player moves this mission one step. */
    public boolean counts(boolean won, long stake) {
        return switch (this) {
            case PLAY_3 -> true;
            case WIN_2 -> won;
            case STAKED_WIN_1 -> won && stake >= MIN_STAKE;
        };
    }
}
