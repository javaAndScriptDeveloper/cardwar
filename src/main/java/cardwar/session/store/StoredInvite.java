package cardwar.session.store;

import java.time.Instant;
import java.util.UUID;

/**
 * An invite as stored. {@code acceptor} and {@code duelId} are null until somebody accepts it; {@code invitee} is set
 * for a challenge to one friend, who alone may accept or decline it.
 */
public record StoredInvite(
        UUID inviteId,
        UUID creator,
        Status status,
        UUID acceptor,
        UUID duelId,
        Instant expiresAt,
        long stake,
        UUID invitee) {

    public enum Status {
        PENDING,
        ACCEPTED,
        DECLINED
    }

    public boolean involves(UUID player) {
        return creator.equals(player) || player.equals(acceptor) || player.equals(invitee);
    }
}
