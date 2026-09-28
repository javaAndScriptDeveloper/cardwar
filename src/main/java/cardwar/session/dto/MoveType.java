package cardwar.session.dto;

/** The move a client is asking for. Mapped to an engine command, which then re-validates it from scratch. */
public enum MoveType {
    ATTACK,
    DEFEND,
    TAKE,
    END_ATTACK
}
