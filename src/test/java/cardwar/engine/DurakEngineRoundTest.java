package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.card;
import static cardwar.engine.Duels.duel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class DurakEngineRoundTest {

    private final DurakEngine engine = new DurakEngine();

    @Test
    void takingMovesEveryTableCardIntoTheDefendersHand() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .talon(card(Rank.SEVEN, Suit.CLUBS), card(Rank.SEVEN, Suit.DIAMONDS))
                .table(
                        new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)),
                        TablePair.undefended(card(Rank.EIGHT, Suit.DIAMONDS)))
                .phase(DuelPhase.DEFEND)
                .build();

        DurakEngine.Result result = engine.apply(state, BOB, new GameCommand.TakeCards());

        assertThat(result.state().handB())
                .contains(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS), card(Rank.EIGHT, Suit.DIAMONDS));
        assertThat(result.state().table()).isEmpty();
        assertThat(result.events()).contains(new GameEvent.CardsTaken(BOB, 3));
    }

    @Test
    void theAttackerKeepsTheAttackAfterATake() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(TablePair.undefended(card(Rank.EIGHT, Suit.DIAMONDS)))
                .phase(DuelPhase.DEFEND)
                .talon(card(Rank.SEVEN, Suit.CLUBS))
                .build();

        DurakEngine.Result result = engine.apply(state, BOB, new GameCommand.TakeCards());

        assertThat(result.state().attackerId()).isEqualTo(ALICE);
    }

    @Test
    void theAttackerCannotTake() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(TablePair.undefended(card(Rank.EIGHT, Suit.DIAMONDS)))
                .phase(DuelPhase.DEFEND)
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.TakeCards()))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.NOT_YOUR_TURN);
    }

    @Test
    void thereIsNothingToTakeWhenEverythingIsBeaten() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        assertThatThrownBy(() -> engine.apply(state, BOB, new GameCommand.TakeCards()))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.NOTHING_TO_TAKE);
    }

    @Test
    void endingTheAttackDiscardsTheTableAndSwapsRoles() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .talon(card(Rank.SEVEN, Suit.CLUBS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().discard())
                .containsExactlyInAnyOrder(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS));
        assertThat(result.state().table()).isEmpty();
        assertThat(result.state().attackerId()).isEqualTo(BOB);
        assertThat(result.events()).contains(new GameEvent.RoundEnded(BOB, true));
    }

    @Test
    void theAttackCannotBeEndedWhileACardIsUndefended() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(TablePair.undefended(card(Rank.EIGHT, Suit.HEARTS)))
                .phase(DuelPhase.DEFEND)
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.EndAttack()))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.UNDEFENDED_CARDS_REMAIN);
    }

    @Test
    void theAttackCannotBeEndedOnAnEmptyTable() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.EndAttack()))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.TABLE_EMPTY);
    }

    @Test
    void theRoundsAttackerRefillsFirst() {
        // Both hands are empty after the round and only one card is left: the attacker of that round takes it.
        DuelState state = duel().handA()
                .handB(card(Rank.ACE, Suit.CLUBS))
                .talon(card(Rank.SEVEN, Suit.CLUBS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().handA()).containsExactly(card(Rank.SEVEN, Suit.CLUBS));
        assertThat(result.state().talon()).isEmpty();
    }

    @Test
    void refillsStopAtSixCards() {
        Card[] sixCards = {
            card(Rank.SIX, Suit.CLUBS),
            card(Rank.SEVEN, Suit.CLUBS),
            card(Rank.EIGHT, Suit.CLUBS),
            card(Rank.NINE, Suit.CLUBS),
            card(Rank.TEN, Suit.CLUBS),
            card(Rank.JACK, Suit.CLUBS)
        };
        DuelState state = duel().handA(sixCards)
                .handB(card(Rank.ACE, Suit.DIAMONDS))
                .talon(card(Rank.QUEEN, Suit.CLUBS), card(Rank.KING, Suit.CLUBS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().handA()).hasSize(6);
        assertThat(result.state().handB()).hasSize(3);
        assertThat(result.state().talon()).isEmpty();
    }

    @Test
    void theRevealedTrumpIsTheLastCardHandedOut() {
        Card trump = card(Rank.SIX, Suit.SPADES);
        DuelState state = duel().handA()
                .handB(card(Rank.ACE, Suit.CLUBS))
                .trumpCard(trump)
                .talon(trump)
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.EndAttack());

        assertThat(result.state().handA()).containsExactly(trump);
        assertThat(result.state().talon()).isEmpty();
    }
}
