package cardwar.session.store;

import java.time.Instant;
import java.util.UUID;

/** An invite as stored. {@code acceptor} and {@code duelId} are null until somebody accepts it. */
public record StoredInvite(UUID inviteId, UUID creator, Status status, UUID acceptor, UUID duelId, Instant expiresAt) {

    public enum Status {
        PENDING,
        ACCEPTED
    }

    public boolean involves(UUID player) {
        return creator.equals(player) || player.equals(acceptor);
    }
}
