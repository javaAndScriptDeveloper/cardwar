package cardwar.session.dto;

import cardwar.engine.Card;
import cardwar.engine.GameCommand;
import cardwar.exception.BadRequestException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * A move as it arrives over HTTP. Shape is checked here so a malformed payload is rejected before any game
 * logic runs; legality is not checked here at all — that is the engine's job, against the real state.
 */
public record MoveRequest(@NotNull MoveType type, @Valid CardRef card, @Valid CardRef attackCard) {

    public GameCommand toCommand() {
        return switch (type) {
            case ATTACK -> new GameCommand.Attack(require(card, "card").toCard());
            case DEFEND ->
                new GameCommand.Defend(
                        require(attackCard, "attackCard").toCard(),
                        require(card, "card").toCard());
            case TAKE -> new GameCommand.TakeCards();
            case END_ATTACK -> new GameCommand.EndAttack();
        };
    }

    private CardRef require(CardRef value, String field) {
        if (value == null) {
            throw new BadRequestException("A " + type + " move requires '" + field + "'");
        }
        return value;
    }

    /** A card as a client names it. Kept separate from the engine's own type so the wire format is ours. */
    public record CardRef(@NotNull cardwar.engine.Rank rank, @NotNull cardwar.engine.Suit suit) {
        public Card toCard() {
            return new Card(rank, suit);
        }
    }
}
