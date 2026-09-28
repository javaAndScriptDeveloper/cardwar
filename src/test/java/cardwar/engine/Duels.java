package cardwar.engine;

import java.util.List;
import java.util.UUID;

/**
 * Builder for hand-crafted duel states. Tests only ever set the few fields they assert on; everything else gets
 * a harmless default, so a test reads as the situation it describes rather than a fourteen-argument constructor.
 */
final class Duels {

    static final PlayerId ALICE = new PlayerId(UUID.fromString("00000000-0000-0000-0000-0000000000a1"));
    static final PlayerId BOB = new PlayerId(UUID.fromString("00000000-0000-0000-0000-0000000000b2"));
    static final DuelId DUEL = new DuelId(UUID.fromString("00000000-0000-0000-0000-0000000000d3"));

    private Duels() {}

    static Card card(Rank rank, Suit suit) {
        return new Card(rank, suit);
    }

    static Builder duel() {
        return new Builder();
    }

    static final class Builder {
        private List<Card> handA = List.of();
        private List<Card> handB = List.of();
        private List<Card> talon = List.of();
        private Suit trumpSuit = Suit.SPADES;
        private Card trumpCard = new Card(Rank.SIX, Suit.SPADES);
        private List<TablePair> table = List.of();
        private List<Card> discard = List.of();
        private PlayerId attacker = ALICE;
        private DuelPhase phase = DuelPhase.ATTACK;
        private Outcome outcome;
        private long version;

        Builder handA(Card... cards) {
            this.handA = List.of(cards);
            return this;
        }

        Builder handB(Card... cards) {
            this.handB = List.of(cards);
            return this;
        }

        Builder talon(Card... cards) {
            this.talon = List.of(cards);
            return this;
        }

        Builder trump(Suit suit) {
            this.trumpSuit = suit;
            this.trumpCard = new Card(Rank.SIX, suit);
            return this;
        }

        Builder trumpCard(Card card) {
            this.trumpCard = card;
            this.trumpSuit = card.suit();
            return this;
        }

        Builder table(TablePair... pairs) {
            this.table = List.of(pairs);
            return this;
        }

        Builder discard(Card... cards) {
            this.discard = List.of(cards);
            return this;
        }

        Builder attacker(PlayerId player) {
            this.attacker = player;
            return this;
        }

        Builder phase(DuelPhase phase) {
            this.phase = phase;
            return this;
        }

        Builder finished(Outcome outcome) {
            this.outcome = outcome;
            this.phase = DuelPhase.FINISHED;
            return this;
        }

        Builder version(long version) {
            this.version = version;
            return this;
        }

        DuelState build() {
            return new DuelState(
                    DUEL, ALICE, BOB, handA, handB, talon, trumpCard, trumpSuit, table, discard, attacker, phase,
                    outcome, version);
        }
    }
}
