package cardwar.session.store;

import cardwar.engine.DuelState;
import java.time.Instant;

/**
 * A duel as the state store holds it: the engine's state plus the one fact the engine has no reason to know —
 * when the duel began — which the finished-result row needs. The move count is not stored separately because
 * the state's version already is one: it increments exactly once per accepted command.
 */
public record StoredDuel(DuelState state, Instant startedAt) {

    public int moveCount() {
        return (int) state.version();
    }

    public StoredDuel with(DuelState next) {
        return new StoredDuel(next, startedAt);
    }
}
