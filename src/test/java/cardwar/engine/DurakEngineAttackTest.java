package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.card;
import static cardwar.engine.Duels.duel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class DurakEngineAttackTest {

    private final DurakEngine engine = new DurakEngine();

    @Test
    void openingAttackPlacesTheCardAndSwitchesToDefence() {
        DuelState state = duel().handA(card(Rank.NINE, Suit.HEARTS))
                .handB(card(Rank.TEN, Suit.HEARTS))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.HEARTS)));

        assertThat(result.state().table()).containsExactly(TablePair.undefended(card(Rank.NINE, Suit.HEARTS)));
        assertThat(result.state().handA()).isEmpty();
        assertThat(result.state().phase()).isEqualTo(DuelPhase.DEFEND);
        assertThat(result.events()).containsExactly(new GameEvent.CardPlayed(ALICE, card(Rank.NINE, Suit.HEARTS)));
    }

    @Test
    void doesNotMutateTheStateItWasGiven() {
        DuelState state = duel().handA(card(Rank.NINE, Suit.HEARTS))
                .handB(card(Rank.TEN, Suit.HEARTS))
                .build();

        engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.HEARTS)));

        assertThat(state.handA()).containsExactly(card(Rank.NINE, Suit.HEARTS));
        assertThat(state.table()).isEmpty();
    }

    @Test
    void incrementsTheVersion() {
        DuelState state = duel().handA(card(Rank.NINE, Suit.HEARTS))
                .handB(card(Rank.TEN, Suit.HEARTS))
                .version(7)
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.HEARTS)));

        assertThat(result.state().version()).isEqualTo(8);
    }

    @Test
    void theDefenderCannotAttack() {
        DuelState state = duel().handA(card(Rank.NINE, Suit.HEARTS))
                .handB(card(Rank.TEN, Suit.HEARTS))
                .build();

        assertThatThrownBy(() -> engine.apply(state, BOB, new GameCommand.Attack(card(Rank.TEN, Suit.HEARTS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.NOT_YOUR_TURN);
    }

    @Test
    void cannotAttackWithACardNotInHand() {
        DuelState state = duel().handA(card(Rank.NINE, Suit.HEARTS))
                .handB(card(Rank.TEN, Suit.HEARTS))
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.ACE, Suit.CLUBS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.CARD_NOT_IN_HAND);
    }

    @Test
    void aThrowInMustMatchARankAlreadyOnTheTable() {
        DuelState state = duel().handA(card(Rank.QUEEN, Suit.CLUBS))
                .handB(card(Rank.TEN, Suit.HEARTS), card(Rank.JACK, Suit.HEARTS))
                .table(TablePair.undefended(card(Rank.NINE, Suit.HEARTS)))
                .phase(DuelPhase.DEFEND)
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.QUEEN, Suit.CLUBS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.RANK_NOT_ON_TABLE);
    }

    @Test
    void aThrowInMatchingARankOnTheTableIsAccepted() {
        DuelState state = duel().handA(card(Rank.NINE, Suit.CLUBS))
                .handB(card(Rank.TEN, Suit.HEARTS), card(Rank.JACK, Suit.HEARTS))
                .table(TablePair.undefended(card(Rank.NINE, Suit.HEARTS)))
                .phase(DuelPhase.DEFEND)
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.CLUBS)));

        assertThat(result.state().table()).hasSize(2);
    }

    @Test
    void aThrowInMayMatchTheRankOfADefenceCard() {
        DuelState state = duel().handA(card(Rank.KING, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.HEARTS), card(Rank.SIX, Suit.CLUBS))
                .table(new TablePair(card(Rank.NINE, Suit.HEARTS), card(Rank.KING, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.KING, Suit.CLUBS)));

        assertThat(result.state().table()).hasSize(2);
    }

    @Test
    void aRoundHoldsAtMostSixAttackCards() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(
                        card(Rank.ACE, Suit.HEARTS),
                        card(Rank.ACE, Suit.CLUBS),
                        card(Rank.ACE, Suit.DIAMONDS),
                        card(Rank.KING, Suit.HEARTS),
                        card(Rank.KING, Suit.CLUBS),
                        card(Rank.KING, Suit.DIAMONDS))
                .table(
                        new TablePair(card(Rank.SIX, Suit.HEARTS), card(Rank.SEVEN, Suit.HEARTS)),
                        new TablePair(card(Rank.SIX, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
                        new TablePair(card(Rank.SEVEN, Suit.CLUBS), card(Rank.EIGHT, Suit.CLUBS)),
                        new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.NINE, Suit.HEARTS)),
                        new TablePair(card(Rank.EIGHT, Suit.DIAMONDS), card(Rank.NINE, Suit.DIAMONDS)),
                        new TablePair(card(Rank.NINE, Suit.CLUBS), card(Rank.TEN, Suit.CLUBS)))
                .build();

        assertThatThrownBy(() -> engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.SIX, Suit.CLUBS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.ATTACK_LIMIT_REACHED);
    }

    @Test
    void throwInsAreCappedByTheDefendersHandSize() {
        // The defender holds two cards and one attack is already unresolved: exactly one more throw-in fits.
        DuelState state = duel().handA(card(Rank.NINE, Suit.CLUBS), card(Rank.NINE, Suit.DIAMONDS))
                .handB(card(Rank.TEN, Suit.HEARTS), card(Rank.JACK, Suit.HEARTS))
                .table(TablePair.undefended(card(Rank.NINE, Suit.HEARTS)))
                .phase(DuelPhase.DEFEND)
                .build();

        DuelState afterFirst = engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.CLUBS)))
                .state();
        assertThat(afterFirst.table()).hasSize(2);

        assertThatThrownBy(
                        () -> engine.apply(afterFirst, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.DIAMONDS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.DEFENDER_HAND_TOO_SMALL);
    }

    @Test
    void aDefendedCardDoesNotCountAgainstTheDefendersHandSize() {
        // One card already beaten, defender holds one card, nothing unresolved — another throw-in is allowed.
        DuelState state = duel().handA(card(Rank.NINE, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.HEARTS))
                .table(new TablePair(card(Rank.NINE, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        DurakEngine.Result result = engine.apply(state, ALICE, new GameCommand.Attack(card(Rank.NINE, Suit.CLUBS)));

        assertThat(result.state().table()).hasSize(2);
    }
}
