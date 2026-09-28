package cardwar.engine;

/** The beat relation, isolated so it can be exercised exhaustively on its own. */
public final class DurakRules {

    private DurakRules() {}

    /**
     * Whether {@code defence} beats {@code attack} given the trump suit.
     *
     * <p>A non-trump beats only a card of the same suit and lower rank. A trump beats any non-trump. A trump is
     * beaten only by a higher trump.
     */
    public static boolean beats(Card attack, Card defence, Suit trumpSuit) {
        boolean attackIsTrump = attack.isTrump(trumpSuit);
        boolean defenceIsTrump = defence.isTrump(trumpSuit);

        if (attackIsTrump) {
            return defenceIsTrump && defence.rank().isHigherThan(attack.rank());
        }
        if (defenceIsTrump) {
            return true;
        }
        return defence.suit() == attack.suit() && defence.rank().isHigherThan(attack.rank());
    }
}
