package cardwar.engine;

import java.util.Objects;

/**
 * Something a player asks the engine to do. Sealed so that every handler switch is exhaustive at compile time,
 * and free of any transport concern — a REST controller and a future Telegram adapter both produce these.
 */
public sealed interface GameCommand {

    /** Place a card as an attack: the opening attack, or a throw-in matching a rank already on the table. */
    record Attack(Card card) implements GameCommand {
        public Attack {
            Objects.requireNonNull(card, "card");
        }
    }

    /** Beat a specific undefended attack card on the table. */
    record Defend(Card attackCard, Card defenceCard) implements GameCommand {
        public Defend {
            Objects.requireNonNull(attackCard, "attackCard");
            Objects.requireNonNull(defenceCard, "defenceCard");
        }
    }

    /** Give up the defence and pick up everything on the table. */
    record TakeCards() implements GameCommand {}

    /** End the attack once every attack card has been beaten, sending the table to the discard pile. */
    record EndAttack() implements GameCommand {}

    /** Give the duel up: the other player wins. Allowed whoever is to move; the timer uses it on a third strike. */
    record Resign() implements GameCommand {}
}
