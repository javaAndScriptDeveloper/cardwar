package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.card;
import static cardwar.engine.Duels.duel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** Resigning (the server does it for a player who ran out of time three times) ends the duel at once. */
class DurakEngineResignTest {

    private final DurakEngine engine = new DurakEngine();

    @Test
    void resigningHandsTheWinToTheOpponentWhoeverIsToMove() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .build();

        DurakEngine.Result result = engine.apply(state, BOB, new GameCommand.Resign());

        assertThat(result.state().phase()).isEqualTo(DuelPhase.FINISHED);
        assertThat(result.state().outcome().winner()).isEqualTo(ALICE);
        assertThat(result.state().outcome().loser()).isEqualTo(BOB);
        assertThat(result.state().outcome().reason()).isEqualTo(EndReason.FORFEIT);
        assertThat(result.state().version()).isEqualTo(state.version() + 1);
        assertThat(result.events())
                .containsExactly(new GameEvent.DuelFinished(result.state().outcome()));
    }

    @Test
    void aFinishedDuelCannotBeResigned() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .build();
        DuelState finished =
                engine.apply(state, ALICE, new GameCommand.Resign()).state();

        assertThatThrownBy(() -> engine.apply(finished, BOB, new GameCommand.Resign()))
                .isInstanceOf(IllegalMoveException.class)
                .extracting("reason")
                .isEqualTo(IllegalMoveReason.DUEL_FINISHED);
    }
}
