package cardwar.engine;

/** Whose action the duel is waiting on. */
public enum DuelPhase {
    /** No undefended card on the table: the attacker may attack, or end the attack if the table is not empty. */
    ATTACK,
    /** At least one undefended card on the table: the defender may defend or take, and the attacker may throw in. */
    DEFEND,
    /** The duel is over; no command is accepted. */
    FINISHED
}
