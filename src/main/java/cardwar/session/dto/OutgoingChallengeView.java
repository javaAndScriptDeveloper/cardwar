package cardwar.session.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A challenge the caller sent: to whom, for how much, and how it stands. {@code status} is {@code WAITING},
 * {@code ACCEPTED}, {@code DECLINED} or {@code EXPIRED} (timed out, or replaced by a newer invite of the caller's).
 */
public record OutgoingChallengeView(
        UUID inviteId, To to, long stake, String status, Instant createdAt, Instant expiresAt) {

    public record To(UUID playerId, String username, String displayName) {}
}
