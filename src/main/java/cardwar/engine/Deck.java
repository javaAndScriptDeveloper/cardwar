package cardwar.engine;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.random.RandomGenerator;

/** Construction and shuffling of the 36-card deck. */
public final class Deck {

    public static final int SIZE = Rank.values().length * Suit.values().length;

    private Deck() {}

    /** Every rank/suit combination exactly once, in declaration order. */
    public static List<Card> ordered() {
        var cards = new ArrayList<Card>(SIZE);
        for (Suit suit : Suit.values()) {
            for (Rank rank : Rank.values()) {
                cards.add(new Card(rank, suit));
            }
        }
        return List.copyOf(cards);
    }

    /**
     * Fisher–Yates driven by the supplied generator. Written out rather than delegating to
     * {@code Collections.shuffle(List, Random)} because that overload would require a {@code java.util.Random},
     * which is banned in this package — production shuffling must come from a {@code SecureRandom}.
     */
    public static List<Card> shuffled(RandomGenerator random) {
        var cards = new ArrayList<>(ordered());
        for (int i = cards.size() - 1; i > 0; i--) {
            Collections.swap(cards, i, random.nextInt(i + 1));
        }
        return List.copyOf(cards);
    }
}
