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

    /**
     * Every card is equally likely at every position: the property that makes a deal fair, and the one an off-by-one
     * in Fisher-Yates (Sattolo's variant, or {@code nextInt(36)} each step) quietly breaks. Pearson's chi-square
     * over the 36 x 36 position table has 1225 degrees of freedom (mean 1225, sd about 49.5); 1500 is over five sd
     * above, so a fair shuffle passes with room to spare and a biased one does not.
     */
    @Test
    void everyCardIsEquallyLikelyAtEveryPosition() {
        int size = Deck.ordered().size();
        int rounds = size * 2000;
        long[][] seen = new long[size][size];
        var random = new SplittableRandom(2026);
        List<Card> ordered = Deck.ordered();
        for (int round = 0; round < rounds; round++) {
            List<Card> shuffled = Deck.shuffled(random);
            for (int position = 0; position < size; position++) {
                seen[ordered.indexOf(shuffled.get(position))][position]++;
            }
        }

        double expected = (double) rounds / size;
        double chiSquare = 0;
        for (long[] row : seen) {
            for (long count : row) {
                chiSquare += (count - expected) * (count - expected) / expected;
            }
        }
        assertThat(chiSquare).isLessThan(1500);
    }
}
