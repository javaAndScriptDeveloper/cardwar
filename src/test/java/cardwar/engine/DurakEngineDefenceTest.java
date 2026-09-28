package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.card;
import static cardwar.engine.Duels.duel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class DurakEngineDefenceTest {

    private final DurakEngine engine = new DurakEngine();

    private static DuelState underAttack(Card attackCard, Card... defenderHand) {
        return duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(defenderHand)
                .table(TablePair.undefended(attackCard))
                .phase(DuelPhase.DEFEND)
                .build();
    }

    @Test
    void beatingWithAHigherCardOfTheSameSuit() {
        DuelState state = underAttack(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS));

        DurakEngine.Result result = engine.apply(
                state, BOB, new GameCommand.Defend(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)));

        assertThat(result.state().table())
                .containsExactly(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)));
        assertThat(result.state().handB()).isEmpty();
        assertThat(result.state().phase()).isEqualTo(DuelPhase.ATTACK);
        assertThat(result.events())
                .containsExactly(
                        new GameEvent.CardDefended(BOB, card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)));
    }

    @Test
    void beatingANonTrumpWithATrump() {
        DuelState state = underAttack(card(Rank.ACE, Suit.HEARTS), card(Rank.SIX, Suit.SPADES));

        DurakEngine.Result result = engine.apply(
                state, BOB, new GameCommand.Defend(card(Rank.ACE, Suit.HEARTS), card(Rank.SIX, Suit.SPADES)));

        assertThat(result.state().table().getFirst().isDefended()).isTrue();
    }

    @Test
    void aTrumpIsNotBeatenByANonTrump() {
        DuelState state = underAttack(card(Rank.SIX, Suit.SPADES), card(Rank.ACE, Suit.HEARTS));

        assertThatThrownBy(() -> engine.apply(
                        state, BOB, new GameCommand.Defend(card(Rank.SIX, Suit.SPADES), card(Rank.ACE, Suit.HEARTS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.CANNOT_BEAT);
    }

    @Test
    void aLowerCardOfTheSameSuitIsRejected() {
        DuelState state = underAttack(card(Rank.TEN, Suit.HEARTS), card(Rank.EIGHT, Suit.HEARTS));

        assertThatThrownBy(() -> engine.apply(
                        state, BOB, new GameCommand.Defend(card(Rank.TEN, Suit.HEARTS), card(Rank.EIGHT, Suit.HEARTS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.CANNOT_BEAT);
    }

    @Test
    void theAttackerCannotDefend() {
        DuelState state = underAttack(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS));

        assertThatThrownBy(() -> engine.apply(
                        state,
                        ALICE,
                        new GameCommand.Defend(card(Rank.EIGHT, Suit.HEARTS), card(Rank.SIX, Suit.CLUBS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.NOT_YOUR_TURN);
    }

    @Test
    void cannotDefendWithACardNotInHand() {
        DuelState state = underAttack(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS));

        assertThatThrownBy(() -> engine.apply(
                        state, BOB, new GameCommand.Defend(card(Rank.EIGHT, Suit.HEARTS), card(Rank.ACE, Suit.SPADES))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.CARD_NOT_IN_HAND);
    }

    @Test
    void cannotDefendACardThatIsNotOnTheTable() {
        DuelState state = underAttack(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS));

        assertThatThrownBy(() -> engine.apply(
                        state, BOB, new GameCommand.Defend(card(Rank.NINE, Suit.CLUBS), card(Rank.TEN, Suit.HEARTS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.TARGET_NOT_ON_TABLE);
    }

    @Test
    void cannotDefendAnAlreadyBeatenCard() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.JACK, Suit.HEARTS))
                .table(new TablePair(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)))
                .build();

        assertThatThrownBy(() -> engine.apply(
                        state,
                        BOB,
                        new GameCommand.Defend(card(Rank.EIGHT, Suit.HEARTS), card(Rank.JACK, Suit.HEARTS))))
                .isInstanceOf(IllegalMoveException.class)
                .extracting(ex -> ((IllegalMoveException) ex).reason())
                .isEqualTo(IllegalMoveReason.TARGET_ALREADY_DEFENDED);
    }

    @Test
    void staysInTheDefendPhaseWhileAnotherAttackIsUnresolved() {
        DuelState state = duel().handA(card(Rank.SIX, Suit.CLUBS))
                .handB(card(Rank.TEN, Suit.HEARTS), card(Rank.TEN, Suit.DIAMONDS))
                .table(
                        TablePair.undefended(card(Rank.EIGHT, Suit.HEARTS)),
                        TablePair.undefended(card(Rank.EIGHT, Suit.DIAMONDS)))
                .phase(DuelPhase.DEFEND)
                .build();

        DurakEngine.Result result = engine.apply(
                state, BOB, new GameCommand.Defend(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS)));

        assertThat(result.state().phase()).isEqualTo(DuelPhase.DEFEND);
    }
}
