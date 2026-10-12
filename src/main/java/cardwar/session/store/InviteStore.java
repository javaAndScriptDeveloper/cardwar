package cardwar.session.store;

import java.util.Optional;
import java.util.UUID;

/**
 * Pending duel invites. Like {@link GameStateStore}, an interface so the service never sees a Redis type, and
 * time-limited by construction: an invite nobody accepts disappears on its own.
 *
 * <p>An accepted invite is kept, not deleted, until it expires: the creator learns the new duel's id by reading it.
 */
public interface InviteStore {

    /**
     * A new invite, or the creator's existing one while it is still pending at the same stake: a player has one open
     * invite. A pending invite at another stake is withdrawn and replaced.
     */
    StoredInvite create(UUID creator, long stake);

    Optional<StoredInvite> find(UUID inviteId);

    /** The creator's invite that nobody has accepted yet, if it has not expired. */
    Optional<StoredInvite> findPending(UUID creator);

    /** Withdraws the creator's pending invite, if any; an accepted one is left alone. */
    void cancelPending(UUID creator);

    /**
     * Atomically turns a pending invite into an accepted one naming the acceptor and the duel. Exactly one caller
     * can ever win this for a given invite, however many accept at the same moment.
     */
    ClaimResult claim(UUID inviteId, UUID acceptor, UUID duelId);

    enum ClaimResult {
        CLAIMED,
        /** Unknown, or expired, which Redis makes indistinguishable. */
        MISSING,
        ALREADY_ACCEPTED
    }
}
