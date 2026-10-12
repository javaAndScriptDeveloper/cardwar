package cardwar.engine;

/** Why a duel ended. Persisted with the result, so values are part of the stored history. */
public enum EndReason {
    /** The talon was exhausted and one player ran out of cards while the other still held some. */
    OPPONENT_OUT_OF_CARDS,
    /** The talon was exhausted and both players ran out of cards at the same round resolution. */
    DRAW,
    /** The loser resigned, or ran out of time too often. */
    FORFEIT
}
