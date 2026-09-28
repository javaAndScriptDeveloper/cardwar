package cardwar.engine;

/** Machine-readable reason a command was rejected. Surfaced to clients so they can explain the rejection. */
public enum IllegalMoveReason {
    NOT_A_PARTICIPANT,
    DUEL_FINISHED,
    NOT_YOUR_TURN,
    CARD_NOT_IN_HAND,
    TABLE_EMPTY,
    ATTACK_LIMIT_REACHED,
    DEFENDER_HAND_TOO_SMALL,
    RANK_NOT_ON_TABLE,
    TARGET_NOT_ON_TABLE,
    TARGET_ALREADY_DEFENDED,
    CANNOT_BEAT,
    UNDEFENDED_CARDS_REMAIN,
    NOTHING_TO_TAKE
}
