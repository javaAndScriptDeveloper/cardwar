package cardwar.session.store;

import java.time.Instant;
import java.util.UUID;

/**
 * A challenge as its sender remembers it. It outlives the invite it was made from, so the sender still learns how
 * it ended after Redis has dropped the invite itself.
 */
public record StoredChallenge(
        UUID inviteId, UUID invitee, long stake, Instant createdAt, Instant expiresAt, Outcome outcome) {

    public enum Outcome {
        WAITING,
        ACCEPTED,
        DECLINED,
        /** Can no longer be accepted without either side answering: it timed out or the sender replaced it. */
        EXPIRED
    }
}
