package cardwar.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

/**
 * An invite as its creator polls it. {@code status} is {@code PENDING} or {@code ACCEPTED}; {@code duelId} appears
 * once accepted, which is how the waiting creator finds the duel to open.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record InviteView(UUID inviteId, String status, UUID duelId, Instant expiresAt, long stake) {}
