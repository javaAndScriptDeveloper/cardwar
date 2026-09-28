package cardwar.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;
import java.util.SplittableRandom;
import org.junit.jupiter.api.Test;

class DeckTest {

    @Test
    void containsThirtySixDistinctCards() {
        List<Card> deck = Deck.ordered();

        assertThat(deck).hasSize(36);
        assertThat(new HashSet<>(deck)).hasSize(36);
    }

    @Test
    void coversEveryRankAndSuitExactlyOnce() {
        List<Card> deck = Deck.ordered();

        for (Suit suit : Suit.values()) {
            for (Rank rank : Rank.values()) {
                assertThat(deck).containsOnlyOnce(new Card(rank, suit));
            }
        }
    }

    @Test
    void holdsNoRankBelowSix() {
        assertThat(Rank.values()[0]).isEqualTo(Rank.SIX);
        assertThat(Deck.ordered())
                .allSatisfy(card -> assertThat(card.rank().value()).isGreaterThanOrEqualTo(6));
    }

    @Test
    void shufflingPreservesTheDeck() {
        List<Card> shuffled = Deck.shuffled(new SplittableRandom(7));

        assertThat(shuffled).hasSize(36).containsExactlyInAnyOrderElementsOf(Deck.ordered());
    }

    @Test
    void sameSeedProducesSameOrder() {
        List<Card> first = Deck.shuffled(new SplittableRandom(42));
        List<Card> second = Deck.shuffled(new SplittableRandom(42));

        assertThat(first).containsExactlyElementsOf(second);
    }

    @Test
    void differentSeedsProduceDifferentOrders() {
        List<Card> first = Deck.shuffled(new SplittableRandom(1));
        List<Card> second = Deck.shuffled(new SplittableRandom(2));

        assertThat(first).isNotEqualTo(second);
    }
}
