package cardwar.engine;

/**
 * Something that happened inside the engine. Events describe public facts only — cards that reach the table,
 * and counts for anything private — so a session can fan them out without leaking a hand.
 */
public sealed interface GameEvent {

    record DuelStarted(DuelId duelId, PlayerId attacker, PlayerId defender, Card trumpCard) implements GameEvent {}

    record CardPlayed(PlayerId attacker, Card card) implements GameEvent {}

    record CardDefended(PlayerId defender, Card attackCard, Card defenceCard) implements GameEvent {}

    record CardsTaken(PlayerId defender, int cardCount) implements GameEvent {}

    record CardsDealt(PlayerId player, int cardCount, int talonRemaining) implements GameEvent {}

    record RoundEnded(PlayerId nextAttacker, boolean defenceSucceeded) implements GameEvent {}

    record DuelFinished(Outcome outcome) implements GameEvent {}
}
