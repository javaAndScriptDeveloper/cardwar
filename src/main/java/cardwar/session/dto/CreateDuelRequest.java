package cardwar.session.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Who to play against. The opponent is named, never the challenger: the challenger is whoever the bearer token
 * says it is, so there is no field here to forge.
 */
public record CreateDuelRequest(@NotBlank @Size(max = 32) String opponentUsername) {}
