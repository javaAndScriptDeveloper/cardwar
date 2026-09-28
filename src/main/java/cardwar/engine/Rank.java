package cardwar.engine;

/**
 * Card ranks in a 36-card Durak deck. Ranks below six do not exist. Declaration order is ascending, so the
 * natural enum order is also the comparison order used throughout the rules.
 */
public enum Rank {
    SIX(6),
    SEVEN(7),
    EIGHT(8),
    NINE(9),
    TEN(10),
    JACK(11),
    QUEEN(12),
    KING(13),
    ACE(14);

    private final int value;

    Rank(int value) {
        this.value = value;
    }

    public int value() {
        return value;
    }

    public boolean isHigherThan(Rank other) {
        return value > other.value;
    }
}
