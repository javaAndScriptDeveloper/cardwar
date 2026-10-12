package cardwar.account.dto;

/**
 * Titles earned with XP, in order. The thresholds are the whole definition: a rank is whatever the player's XP has
 * reached, never a stored column that could drift from it.
 */
public enum Rank {
    DURAK(0),
    PIDKYDNYI(100),
    KOZYR(300),
    SHULER(700),
    LEHENDA(1500);

    private final int minXp;

    Rank(int minXp) {
        this.minXp = minXp;
    }

    public int minXp() {
        return minXp;
    }

    /** The XP the next rank starts at; null at the top. */
    public Integer nextXp() {
        Rank[] all = values();
        return ordinal() + 1 < all.length ? all[ordinal() + 1].minXp : null;
    }

    public static Rank of(int xp) {
        Rank rank = DURAK;
        for (Rank candidate : values()) {
            if (xp >= candidate.minXp) {
                rank = candidate;
            }
        }
        return rank;
    }
}
