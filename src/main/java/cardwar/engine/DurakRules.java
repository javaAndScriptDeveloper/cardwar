package cardwar.engine;

import java.util.Comparator;

/** The beat relation, and the move-clock rules built on the state, isolated so they can be exercised on their own. */
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

    /**
     * Whose clock runs: the defender while any attack is unbeaten (they must beat or take), otherwise the attacker
     * (who must open, throw in or end the attack). Null once the duel is over.
     */
    public static PlayerId toMove(DuelState state) {
        if (state.isFinished()) {
            return null;
        }
        return state.undefendedCount() > 0 ? state.defenderId() : state.attackerId();
    }

    /**
     * What the server plays for the player whose clock ran out: the least damaging legal move. The defender takes;
     * an attacker facing a beaten table ends the attack; an attacker on an empty table leads the lowest non-trump
     * (the lowest trump if that is all they hold).
     */
    public static GameCommand timeoutCommand(DuelState state) {
        if (state.undefendedCount() > 0) {
            return new GameCommand.TakeCards();
        }
        if (!state.table().isEmpty()) {
            return new GameCommand.EndAttack();
        }
        Suit trump = state.trumpSuit();
        Card lowest = state.handOf(state.attackerId()).stream()
                .min(Comparator.comparing((Card card) -> card.isTrump(trump)).thenComparing(Card::rank))
                .orElseThrow();
        return new GameCommand.Attack(lowest);
    }
}
