package cardwar.session.store;

import cardwar.engine.DuelState;
import cardwar.engine.PlayerId;
import java.time.Instant;

/**
 * A duel as the state store holds it: the engine's state plus what the engine has no reason to know — when the duel
 * began (the result row needs it), the coins at stake (settlement and the views need them), and the move clock: the
 * deadline of whoever is to move and each player's strikes (clocks that ran out on them). The move count is not
 * stored separately because the state's version already is one: it increments exactly once per accepted command.
 *
 * @param deadline when the player to move runs out of time; null once the duel is over
 */
public record StoredDuel(DuelState state, Instant startedAt, long stake, Instant deadline, int strikesA, int strikesB) {

    /** A friendly duel with no clock, as stored before stakes and the timer existed. */
    public StoredDuel(DuelState state, Instant startedAt) {
        this(state, startedAt, 0, null, 0, 0);
    }

    public StoredDuel(DuelState state, Instant startedAt, long stake) {
        this(state, startedAt, stake, null, 0, 0);
    }

    public int moveCount() {
        return (int) state.version();
    }

    public StoredDuel with(DuelState next) {
        return new StoredDuel(next, startedAt, stake, deadline, strikesA, strikesB);
    }

    public StoredDuel withDeadline(Instant next) {
        return new StoredDuel(state, startedAt, stake, next, strikesA, strikesB);
    }

    public int strikesOf(PlayerId player) {
        return player.equals(state.playerA()) ? strikesA : strikesB;
    }

    public StoredDuel withStrikes(PlayerId player, int strikes) {
        return player.equals(state.playerA())
                ? new StoredDuel(state, startedAt, stake, deadline, strikes, strikesB)
                : new StoredDuel(state, startedAt, stake, deadline, strikesA, strikes);
    }
}
