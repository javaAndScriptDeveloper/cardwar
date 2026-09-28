package cardwar.session.dto;

import cardwar.engine.Outcome;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

/** How a duel ended. Winner and loser are absent for a draw. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OutcomeView(UUID winner, UUID loser, boolean draw, String reason) {

    public static OutcomeView of(Outcome outcome) {
        return new OutcomeView(
                outcome.winner() == null ? null : outcome.winner().value(),
                outcome.loser() == null ? null : outcome.loser().value(),
                outcome.draw(),
                outcome.reason().name());
    }
}
