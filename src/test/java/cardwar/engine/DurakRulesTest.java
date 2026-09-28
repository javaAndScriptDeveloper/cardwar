package cardwar.engine;

import static cardwar.engine.Duels.card;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DurakRulesTest {

    private static final Suit TRUMP = Suit.SPADES;

    @Test
    void higherCardOfTheSameSuitBeats() {
        assertThat(DurakRules.beats(card(Rank.EIGHT, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS), TRUMP))
                .isTrue();
    }

    @Test
    void lowerCardOfTheSameSuitDoesNotBeat() {
        assertThat(DurakRules.beats(card(Rank.TEN, Suit.HEARTS), card(Rank.EIGHT, Suit.HEARTS), TRUMP))
                .isFalse();
    }

    @Test
    void equalRankDoesNotBeat() {
        assertThat(DurakRules.beats(card(Rank.TEN, Suit.HEARTS), card(Rank.TEN, Suit.HEARTS), TRUMP))
                .isFalse();
    }

    @Test
    void higherCardOfAnotherNonTrumpSuitDoesNotBeat() {
        assertThat(DurakRules.beats(card(Rank.EIGHT, Suit.HEARTS), card(Rank.ACE, Suit.DIAMONDS), TRUMP))
                .isFalse();
    }

    @Test
    void anyTrumpBeatsAnyNonTrump() {
        assertThat(DurakRules.beats(card(Rank.ACE, Suit.HEARTS), card(Rank.SIX, TRUMP), TRUMP))
                .isTrue();
    }

    @Test
    void nonTrumpNeverBeatsATrump() {
        assertThat(DurakRules.beats(card(Rank.SIX, TRUMP), card(Rank.ACE, Suit.HEARTS), TRUMP))
                .isFalse();
    }

    @Test
    void higherTrumpBeatsLowerTrump() {
        assertThat(DurakRules.beats(card(Rank.SIX, TRUMP), card(Rank.SEVEN, TRUMP), TRUMP))
                .isTrue();
    }

    @Test
    void lowerTrumpDoesNotBeatHigherTrump() {
        assertThat(DurakRules.beats(card(Rank.KING, TRUMP), card(Rank.QUEEN, TRUMP), TRUMP))
                .isFalse();
    }
}
