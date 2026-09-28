package cardwar.engine;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.random.RandomGenerator;

/**
 * The Durak rules engine: commands in, a new state and the events it produced out.
 *
 * <p>Two-player throw-in (<em>podkidnoy</em>) Durak over a 36-card deck. Transferring the attack
 * (<em>perevod</em>) is not part of this variant.
 *
 * <p>This class knows nothing about HTTP, Redis, Spring or Telegram, and holds no state between calls. Every
 * command is re-validated against the state it is given — the engine never assumes a caller pre-checked
 * anything.
 */
public final class DurakEngine {

    /** Hands are topped up to this size between rounds while the talon lasts. */
    public static final int HAND_SIZE = 6;

    /** No round may put more than this many attack cards on the table. */
    public static final int MAX_ATTACK_CARDS = 6;

    private final RandomGenerator random;

    /** Production constructor: shuffling is backed by {@link SecureRandom}. */
    public DurakEngine() {
        this(new SecureRandom());
    }

    /**
     * Test constructor: a seeded generator makes a failing duel reproducible. Production code must not use this
     * with a predictable generator — a guessable shuffle is a guessable hand.
     */
    public DurakEngine(RandomGenerator random) {
        this.random = Objects.requireNonNull(random, "random");
    }

    /** The result of applying a command: the new state, plus what happened. */
    public record Result(DuelState state, List<GameEvent> events) {
        public Result {
            Objects.requireNonNull(state, "state");
            events = List.copyOf(events);
        }
    }

    /** Shuffle, deal six each, reveal the trump and decide who attacks first. */
    public Result start(DuelId duelId, PlayerId playerA, PlayerId playerB) {
        Objects.requireNonNull(duelId, "duelId");
        Objects.requireNonNull(playerA, "playerA");
        Objects.requireNonNull(playerB, "playerB");
        if (playerA.equals(playerB)) {
            throw new IllegalArgumentException("a duel needs two distinct players");
        }

        List<Card> deck = Deck.shuffled(random);
        List<Card> handA = new ArrayList<>(deck.subList(0, HAND_SIZE));
        List<Card> handB = new ArrayList<>(deck.subList(HAND_SIZE, HAND_SIZE * 2));
        List<Card> talon = new ArrayList<>(deck.subList(HAND_SIZE * 2, deck.size()));

        Card trumpCard = talon.getLast();
        Suit trumpSuit = trumpCard.suit();
        PlayerId attacker = firstAttacker(handA, handB, trumpSuit, playerA, playerB);
        PlayerId defender = attacker.equals(playerA) ? playerB : playerA;

        var state = new DuelState(
                duelId,
                playerA,
                playerB,
                handA,
                handB,
                talon,
                trumpCard,
                trumpSuit,
                List.of(),
                List.of(),
                attacker,
                DuelPhase.ATTACK,
                null,
                0L);

        List<GameEvent> events = List.of(
                new GameEvent.DuelStarted(duelId, attacker, defender, trumpCard),
                new GameEvent.CardsDealt(playerA, HAND_SIZE, talon.size()),
                new GameEvent.CardsDealt(playerB, HAND_SIZE, talon.size()));
        return new Result(state, events);
    }

    /** Apply one command on behalf of one player. The state passed in is never modified. */
    public Result apply(DuelState state, PlayerId actor, GameCommand command) {
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(actor, "actor");
        Objects.requireNonNull(command, "command");

        if (!state.hasParticipant(actor)) {
            throw new IllegalMoveException(IllegalMoveReason.NOT_A_PARTICIPANT, "player is not in this duel");
        }
        if (state.isFinished()) {
            throw new IllegalMoveException(IllegalMoveReason.DUEL_FINISHED, "the duel is already over");
        }

        var working = new Working(state);
        switch (command) {
            case GameCommand.Attack attack -> attack(working, actor, attack.card());
            case GameCommand.Defend defend -> defend(working, actor, defend.attackCard(), defend.defenceCard());
            case GameCommand.TakeCards ignored -> take(working, actor);
            case GameCommand.EndAttack ignored -> endAttack(working, actor);
        }
        working.version = state.version() + 1;
        return new Result(working.freeze(), working.events);
    }

    // --- command handlers ---------------------------------------------------------------------------------

    private void attack(Working w, PlayerId actor, Card card) {
        requireTurn(actor, w.attackerId);
        List<Card> hand = w.hand(actor);
        if (!hand.contains(card)) {
            throw new IllegalMoveException(IllegalMoveReason.CARD_NOT_IN_HAND, "card is not in your hand");
        }
        if (w.table.size() >= MAX_ATTACK_CARDS) {
            throw new IllegalMoveException(
                    IllegalMoveReason.ATTACK_LIMIT_REACHED, "a round holds at most " + MAX_ATTACK_CARDS + " attacks");
        }
        int undefended =
                (int) w.table.stream().filter(pair -> !pair.isDefended()).count();
        if (undefended >= w.hand(w.defenderId()).size()) {
            throw new IllegalMoveException(
                    IllegalMoveReason.DEFENDER_HAND_TOO_SMALL, "the defender has no card left to beat another attack");
        }
        if (!w.table.isEmpty() && !rankIsOnTable(w.table, card.rank())) {
            throw new IllegalMoveException(
                    IllegalMoveReason.RANK_NOT_ON_TABLE, "a throw-in must match a rank already on the table");
        }

        hand.remove(card);
        w.table.add(TablePair.undefended(card));
        w.events.add(new GameEvent.CardPlayed(actor, card));
        w.phase = DuelPhase.DEFEND;
    }

    private void defend(Working w, PlayerId actor, Card attackCard, Card defenceCard) {
        requireTurn(actor, w.defenderId());
        int index = indexOfAttack(w.table, attackCard);
        if (index < 0) {
            throw new IllegalMoveException(
                    IllegalMoveReason.TARGET_NOT_ON_TABLE, "that attack card is not on the table");
        }
        if (w.table.get(index).isDefended()) {
            throw new IllegalMoveException(
                    IllegalMoveReason.TARGET_ALREADY_DEFENDED, "that attack card has already been beaten");
        }
        List<Card> hand = w.hand(actor);
        if (!hand.contains(defenceCard)) {
            throw new IllegalMoveException(IllegalMoveReason.CARD_NOT_IN_HAND, "card is not in your hand");
        }
        if (!DurakRules.beats(attackCard, defenceCard, w.trumpSuit)) {
            throw new IllegalMoveException(IllegalMoveReason.CANNOT_BEAT, "that card does not beat the attack");
        }

        hand.remove(defenceCard);
        w.table.set(index, w.table.get(index).defendedWith(defenceCard));
        w.events.add(new GameEvent.CardDefended(actor, attackCard, defenceCard));
        w.phase = w.table.stream().anyMatch(pair -> !pair.isDefended()) ? DuelPhase.DEFEND : DuelPhase.ATTACK;
    }

    private void take(Working w, PlayerId actor) {
        requireTurn(actor, w.defenderId());
        if (w.table.stream().noneMatch(pair -> !pair.isDefended())) {
            throw new IllegalMoveException(IllegalMoveReason.NOTHING_TO_TAKE, "there is nothing to take");
        }

        List<Card> hand = w.hand(actor);
        int taken = 0;
        for (TablePair pair : w.table) {
            hand.add(pair.attack());
            taken++;
            if (pair.isDefended()) {
                hand.add(pair.defence());
                taken++;
            }
        }
        w.table.clear();
        w.events.add(new GameEvent.CardsTaken(actor, taken));
        endRound(w, false);
    }

    private void endAttack(Working w, PlayerId actor) {
        requireTurn(actor, w.attackerId);
        if (w.table.isEmpty()) {
            throw new IllegalMoveException(IllegalMoveReason.TABLE_EMPTY, "there is no attack to end");
        }
        if (w.table.stream().anyMatch(pair -> !pair.isDefended())) {
            throw new IllegalMoveException(
                    IllegalMoveReason.UNDEFENDED_CARDS_REMAIN, "an attack card on the table is still undefended");
        }

        for (TablePair pair : w.table) {
            w.discard.add(pair.attack());
            w.discard.add(pair.defence());
        }
        w.table.clear();
        endRound(w, true);
    }

    // --- round resolution ---------------------------------------------------------------------------------

    private void endRound(Working w, boolean defenceSucceeded) {
        PlayerId roundAttacker = w.attackerId;
        PlayerId roundDefender = w.defenderId();

        // The attacker of the finished round refills first, then the defender.
        refill(w, roundAttacker);
        refill(w, roundDefender);

        w.attackerId = defenceSucceeded ? roundDefender : roundAttacker;
        w.events.add(new GameEvent.RoundEnded(w.attackerId, defenceSucceeded));

        if (!finishIfOver(w)) {
            w.phase = DuelPhase.ATTACK;
        }
    }

    private void refill(Working w, PlayerId player) {
        List<Card> hand = w.hand(player);
        int drawn = 0;
        while (hand.size() < HAND_SIZE && !w.talon.isEmpty()) {
            hand.add(w.talon.removeFirst());
            drawn++;
        }
        if (drawn > 0) {
            w.events.add(new GameEvent.CardsDealt(player, drawn, w.talon.size()));
        }
    }

    private boolean finishIfOver(Working w) {
        if (!w.talon.isEmpty()) {
            return false;
        }
        boolean aOut = w.handA.isEmpty();
        boolean bOut = w.handB.isEmpty();
        if (!aOut && !bOut) {
            return false;
        }

        w.outcome = aOut && bOut
                ? Outcome.drawn()
                : aOut ? Outcome.decided(w.playerA, w.playerB) : Outcome.decided(w.playerB, w.playerA);
        w.phase = DuelPhase.FINISHED;
        w.events.add(new GameEvent.DuelFinished(w.outcome));
        return true;
    }

    // --- helpers ------------------------------------------------------------------------------------------

    private static void requireTurn(PlayerId actor, PlayerId expected) {
        if (!actor.equals(expected)) {
            throw new IllegalMoveException(IllegalMoveReason.NOT_YOUR_TURN, "it is not your move");
        }
    }

    private static boolean rankIsOnTable(List<TablePair> table, Rank rank) {
        return table.stream()
                .anyMatch(pair -> pair.attack().rank() == rank
                        || (pair.isDefended() && pair.defence().rank() == rank));
    }

    private static int indexOfAttack(List<TablePair> table, Card attackCard) {
        for (int i = 0; i < table.size(); i++) {
            if (table.get(i).attack().equals(attackCard)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Lowest trump attacks first. With no trump in either hand the lowest card overall attacks; a tie there is
     * broken by seating, which is already randomised by the shuffle.
     */
    static PlayerId firstAttacker(
            List<Card> handA, List<Card> handB, Suit trumpSuit, PlayerId playerA, PlayerId playerB) {
        Optional<Card> trumpA = lowest(handA, card -> card.isTrump(trumpSuit));
        Optional<Card> trumpB = lowest(handB, card -> card.isTrump(trumpSuit));
        if (trumpA.isPresent() || trumpB.isPresent()) {
            if (trumpA.isEmpty()) {
                return playerB;
            }
            if (trumpB.isEmpty()) {
                return playerA;
            }
            return trumpA.get().rank().isHigherThan(trumpB.get().rank()) ? playerB : playerA;
        }
        Card lowestA = lowest(handA, card -> true).orElseThrow();
        Card lowestB = lowest(handB, card -> true).orElseThrow();
        return lowestA.rank().isHigherThan(lowestB.rank()) ? playerB : playerA;
    }

    private static Optional<Card> lowest(List<Card> hand, java.util.function.Predicate<Card> filter) {
        return hand.stream().filter(filter).min(Comparator.comparing(Card::rank));
    }

    /** Mutable scratch copy, frozen back into an immutable {@link DuelState} once the command has been applied. */
    private static final class Working {
        private final DuelId duelId;
        private final PlayerId playerA;
        private final PlayerId playerB;
        private final List<Card> handA;
        private final List<Card> handB;
        private final List<Card> talon;
        private final List<TablePair> table;
        private final List<Card> discard;
        private final Card trumpCard;
        private final Suit trumpSuit;
        private final List<GameEvent> events = new ArrayList<>();
        private PlayerId attackerId;
        private DuelPhase phase;
        private Outcome outcome;
        private long version;

        private Working(DuelState state) {
            this.duelId = state.duelId();
            this.playerA = state.playerA();
            this.playerB = state.playerB();
            this.handA = new ArrayList<>(state.handA());
            this.handB = new ArrayList<>(state.handB());
            this.talon = new ArrayList<>(state.talon());
            this.table = new ArrayList<>(state.table());
            this.discard = new ArrayList<>(state.discard());
            this.trumpCard = state.trumpCard();
            this.trumpSuit = state.trumpSuit();
            this.attackerId = state.attackerId();
            this.phase = state.phase();
            this.outcome = state.outcome();
            this.version = state.version();
        }

        private PlayerId defenderId() {
            return attackerId.equals(playerA) ? playerB : playerA;
        }

        private List<Card> hand(PlayerId player) {
            return player.equals(playerA) ? handA : handB;
        }

        private DuelState freeze() {
            return new DuelState(
                    duelId,
                    playerA,
                    playerB,
                    handA,
                    handB,
                    talon,
                    trumpCard,
                    trumpSuit,
                    table,
                    discard,
                    attackerId,
                    phase,
                    outcome,
                    version);
        }
    }
}
