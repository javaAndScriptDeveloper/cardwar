package cardwar.session.dto;

/** The move a client is asking for. Mapped to an engine command, which then re-validates it from scratch. */
public enum MoveType {
    ATTACK,
    DEFEND,
    TAKE,
    END_ATTACK,
    /** Leave the duel: it ends at once as a forfeit, the opponent wins. Allowed on either player's turn. */
    RESIGN
}
