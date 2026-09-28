package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.card;
import static cardwar.engine.Duels.duel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class DurakEngineEndConditionsTest {

    private final DurakEngine engine = new DurakEngine();

    @Test
    void theFirstPlayerOutOfCardsWinsAndTheOtherIsTheDurak() {
        // Talon empty, Alice plays her last card and beats it away; Bob is left holding one.
        DuelState state = duel().handA()
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().phase()).isEqualTo(DuelPhase.FINISHED);
        assertThat(result.state().outcome().winner()).isEqualTo(ALICE);
        assertThat(result.state().outcome().loser()).isEqualTo(BOB);
        assertThat(result.state().outcome().draw()).isFalse();
        assertThat(result.state().outcome().reason()).isEqualTo(EndReason.OPPONENT_OUT_OF_CARDS);
        assertThat(result.events())
                .contains(new GameEvent.DuelFinished(result.state().outcome()));
    }

    @Test
    void bothHandsEmptyingTogetherIsADraw() {
        DuelState state = duel().handA()
                .handB()
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().phase()).isEqualTo(DuelPhase.FINISHED);
        assertThat(result.state().outcome().draw()).isTrue();
        assertThat(result.state().outcome().winner()).isNull();
        assertThat(result.state().outcome().loser()).isNull();
        assertThat(result.state().outcome().reason()).isEqualTo(EndReason.DRAW);
    }

    @Test
    void theDuelDoesNotEndWhileTheTalonStillHasCards() {
        DuelState state = duel().handA()
                .handB(card(Rank.ACE, Suit.CLUBS))
                .talon(card(Rank.SEVEN, Suit.CLUBS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().phase()).isEqualTo(DuelPhase.ATTACK);
        assertThat(result.state().outcome()).isNull();
    }

    @Test
    void aTakeCanAlsoEndTheDuel() {
        // Talon empty and the attacker throws in her last card; the defender takes and the attacker is out.
        DuelState state = duel().handA()
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(TablePair.undefended(card(Rank.EIGHT, Suit.HEARTS)))
                .phase(DuelPhase.DEFEND)
                .build();

        DurakEngine.Result result = engine.apply(state, BOB, new GameCommand.TakeCards());

        assertThat(result.state().phase()).isEqualTo(DuelPhase.FINISHED);
        assertThat(result.state().outcome().winner()).isEqualTo(ALICE);
        assertThat(result.state().outcome().loser()).isEqualTo(BOB);
    }

    @Test
    void noCommandIsAcceptedOnceTheDuelIsOver() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .finished(Outcome.decided(ALICE, BOB))
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.SIX, Suit.CLUBS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.DUEL_FINISHED);
        assertThatThrownBy(() -> engine.apply(state, BOB, new GameCommand.TakeCards()))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.DUEL_FINISHED);
    }

    @Test
    void anOutsiderCannotActOnTheDuel() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .build();
        var outsider = new PlayerId(UUID.randomUUID());

        assertThatThrownBy(() -> engine.apply(state, outsider, new GameCommand.Attack(card(Rank.SIX, Suit.CLUBS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.NOT_A_PARTICIPANT);
    }
}
