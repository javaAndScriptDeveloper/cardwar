package cardwar.session.store;

import cardwar.engine.DuelId;
import java.util.Optional;

/**
 * Where in-progress duels live. Deliberately an interface: the session service is written against this and never
 * against a Redis type, so the backing store is a configuration decision rather than a rewrite.
 *
 * <p>Writes are conditional on the version that was read. Two players moving at the same moment therefore
 * produce one winner and one conflict, instead of one silently overwriting the other's move.
 */
public interface GameStateStore {

    /** Expected version for a duel that must not exist yet. */
    long ABSENT = -1L;

    Optional<StoredDuel> find(DuelId duelId);

    /**
     * Stores the duel, but only if the stored version still equals {@code expectedVersion} (or, for
     * {@link #ABSENT}, only if nothing is stored). Refreshes the time-to-live.
     *
     * @throws cardwar.exception.ConflictException if the stored version has moved on
     */
    void save(StoredDuel duel, long expectedVersion);

    void delete(DuelId duelId);
}
