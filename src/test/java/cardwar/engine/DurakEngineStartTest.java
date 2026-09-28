package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.DUEL;
import static cardwar.engine.Duels.card;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.SplittableRandom;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class DurakEngineStartTest {

    @Test
    void dealsSixEachAndLeavesTwentyFourInTheTalon() {
        DuelState state = engine(1).start(DUEL, ALICE, BOB).state();

        assertThat(state.handA()).hasSize(6);
        assertThat(state.handB()).hasSize(6);
        assertThat(state.talon()).hasSize(24);
    }

    @Test
    void revealsTheBottomOfTheTalonAsTrump() {
        DuelState state = engine(2).start(DUEL, ALICE, BOB).state();

        assertThat(state.trumpCard()).isEqualTo(state.talon().getLast());
        assertThat(state.trumpSuit()).isEqualTo(state.trumpCard().suit());
    }

    @Test
    void everyCardIsAccountedForExactlyOnce() {
        DuelState state = engine(3).start(DUEL, ALICE, BOB).state();

        var all = new ArrayList<Card>();
        all.addAll(state.handA());
        all.addAll(state.handB());
        all.addAll(state.talon());
        assertThat(all).containsExactlyInAnyOrderElementsOf(Deck.ordered());
    }

    @Test
    void startsInTheAttackPhaseAtVersionZero() {
        DuelState state = engine(4).start(DUEL, ALICE, BOB).state();

        assertThat(state.phase()).isEqualTo(DuelPhase.ATTACK);
        assertThat(state.version()).isZero();
        assertThat(state.table()).isEmpty();
        assertThat(state.discard()).isEmpty();
        assertThat(state.outcome()).isNull();
    }

    @Test
    void announcesTheStartAndBothDeals() {
        DurakEngine.Result result = engine(5).start(DUEL, ALICE, BOB);

        assertThat(result.events()).hasSize(3);
        assertThat(result.events().getFirst()).isInstanceOf(GameEvent.DuelStarted.class);
        assertThat(result.events())
                .filteredOn(GameEvent.CardsDealt.class::isInstance)
                .hasSize(2);
    }

    @Test
    void refusesADuelAgainstOneself() {
        assertThatThrownBy(() -> engine(6).start(DUEL, ALICE, ALICE))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("two distinct players");
    }

    /** Across many deals, the attacker is always the holder of the lowest trump. */
    @Test
    void lowestTrumpAlwaysAttacksFirst() {
        IntStream.range(0, 200).forEach(seed -> {
            DuelState state = engine(seed).start(DUEL, ALICE, BOB).state();
            var lowestA = lowestTrump(state.handA(), state.trumpSuit());
            var lowestB = lowestTrump(state.handB(), state.trumpSuit());
            if (lowestA != null && lowestB != null) {
                PlayerId expected = lowestA.rank().isHigherThan(lowestB.rank()) ? BOB : ALICE;
                assertThat(state.attackerId()).isEqualTo(expected);
            } else if (lowestA != null) {
                assertThat(state.attackerId()).isEqualTo(ALICE);
            } else if (lowestB != null) {
                assertThat(state.attackerId()).isEqualTo(BOB);
            }
        });
    }

    @Test
    void withNoTrumpsInEitherHandTheLowestCardAttacks() {
        // Trump is spades, and neither hand holds one — so the rule falls through to the lowest card overall.
        List<Card> handA = List.of(
                card(Rank.NINE, Suit.HEARTS),
                card(Rank.TEN, Suit.HEARTS),
                card(Rank.JACK, Suit.HEARTS),
                card(Rank.QUEEN, Suit.HEARTS),
                card(Rank.KING, Suit.HEARTS),
                card(Rank.ACE, Suit.HEARTS));
        List<Card> handB = List.of(
                card(Rank.SEVEN, Suit.CLUBS),
                card(Rank.EIGHT, Suit.CLUBS),
                card(Rank.NINE, Suit.CLUBS),
                card(Rank.TEN, Suit.CLUBS),
                card(Rank.JACK, Suit.CLUBS),
                card(Rank.QUEEN, Suit.CLUBS));

        assertThat(DurakEngine.firstAttacker(handA, handB, Suit.SPADES, ALICE, BOB))
                .isEqualTo(BOB);
    }

    @Test
    void aTieOnTheLowestRankFallsBackToSeating() {
        List<Card> handA = List.of(card(Rank.SIX, Suit.HEARTS));
        List<Card> handB = List.of(card(Rank.SIX, Suit.CLUBS));

        assertThat(DurakEngine.firstAttacker(handA, handB, Suit.SPADES, ALICE, BOB))
                .isEqualTo(ALICE);
        assertThat(DurakEngine.firstAttacker(handA, handB, Suit.SPADES, ALICE, BOB))
                .isEqualTo(ALICE);
    }

    private static Card lowestTrump(List<Card> hand, Suit trump) {
        return hand.stream()
                .filter(c -> c.isTrump(trump))
                .min(Comparator.comparing(Card::rank))
                .orElse(null);
    }

    private static DurakEngine engine(long seed) {
        return new DurakEngine(new SplittableRandom(seed));
    }
}
