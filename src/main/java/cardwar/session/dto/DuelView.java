package cardwar.session.dto;

import cardwar.engine.Card;
import cardwar.engine.DuelPhase;
import cardwar.engine.DuelState;
import cardwar.engine.DurakRules;
import cardwar.engine.PlayerId;
import cardwar.session.store.StoredDuel;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * One player's view of a duel. Redaction is built into the constructor rather than applied by callers: the
 * opponent's hand and the talon are reduced to counts here, so there is no code path that can accidentally
 * serialize the full state to a client.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DuelView(
        UUID duelId,
        UUID you,
        UUID opponent,
        List<Card> hand,
        int opponentHandCount,
        int talonCount,
        Card trumpCard,
        cardwar.engine.Suit trumpSuit,
        List<TablePairView> table,
        int discardCount,
        UUID attacker,
        DuelPhase phase,
        OutcomeView outcome,
        long version,
        long stake,
        Instant deadline,
        UUID toMove,
        StrikesView strikes) {

    /** Clocks that ran out on each side; the third one forfeits. */
    public record StrikesView(int you, int opponent) {}

    public static DuelView of(StoredDuel stored, PlayerId viewer) {
        DuelState state = stored.state();
        PlayerId mover = DurakRules.toMove(state);
        return of(
                state,
                viewer,
                stored.stake(),
                state.isFinished() ? null : stored.deadline(),
                mover == null ? null : mover.value(),
                new StrikesView(stored.strikesOf(viewer), stored.strikesOf(state.opponentOf(viewer))));
    }

    private static DuelView of(
            DuelState state, PlayerId viewer, long stake, Instant deadline, UUID toMove, StrikesView strikes) {
        PlayerId opponent = state.opponentOf(viewer);
        return new DuelView(
                state.duelId().value(),
                viewer.value(),
                opponent.value(),
                state.handOf(viewer),
                state.handOf(opponent).size(),
                state.talon().size(),
                state.trumpCard(),
                state.trumpSuit(),
                state.table().stream().map(TablePairView::of).toList(),
                state.discard().size(),
                state.attackerId().value(),
                state.phase(),
                state.outcome() == null ? null : OutcomeView.of(state.outcome()),
                state.version(),
                stake,
                deadline,
                toMove,
                strikes);
    }
}
