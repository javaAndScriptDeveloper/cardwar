package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.DUEL;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.SplittableRandom;
import org.junit.jupiter.api.Test;

/**
 * Drives complete duels with a simple deterministic strategy and checks that the invariants hold at every step.
 * The point is the interaction between rules — refill order, throw-in caps and end conditions together — which
 * unit tests of individual rules cannot reach.
 */
class DurakEngineFullGameTest {

    private static final int MOVE_LIMIT = 1_000;

    @Test
    void everyDuelTerminatesWithAValidOutcome() {
        for (long seed = 0; seed < 60; seed++) {
            DuelState finished = playOut(seed);

            assertThat(finished.phase()).isEqualTo(DuelPhase.FINISHED);
            assertThat(finished.talon()).isEmpty();
            assertThat(finished.outcome()).isNotNull();
            if (finished.outcome().draw()) {
                assertThat(finished.handA()).isEmpty();
                assertThat(finished.handB()).isEmpty();
            } else {
                assertThat(finished.handOf(finished.outcome().winner())).isEmpty();
                assertThat(finished.handOf(finished.outcome().loser())).isNotEmpty();
            }
        }
    }

    @Test
    void everyCardIsAccountedForAtEveryStep() {
        for (long seed = 100; seed < 130; seed++) {
            playOut(seed);
        }
    }

    /** Plays one duel to completion, asserting the card-conservation invariant after every command. */
    private DuelState playOut(long seed) {
        var engine = new DurakEngine(new SplittableRandom(seed));
        DuelState state = engine.start(DUEL, ALICE, BOB).state();
        assertAllCardsPresent(state);

        int moves = 0;
        while (!state.isFinished()) {
            assertThat(moves++).as("duel with seed %d did not terminate", seed).isLessThan(MOVE_LIMIT);
            state = engine.apply(state, actor(state), nextCommand(state)).state();
            assertAllCardsPresent(state);
        }
        return state;
    }

    private static PlayerId actor(DuelState state) {
        return state.phase() == DuelPhase.DEFEND ? state.defenderId() : state.attackerId();
    }

    /**
     * Attack whenever legal, otherwise end the attack. Defend the first unresolved card with the cheapest card
     * that beats it, otherwise take.
     */
    private static GameCommand nextCommand(DuelState state) {
        if (state.phase() == DuelPhase.DEFEND) {
            Card target = state.table().stream()
                    .filter(pair -> !pair.isDefended())
                    .findFirst()
                    .orElseThrow()
                    .attack();
            return state.handOf(state.defenderId()).stream()
                    .filter(candidate -> DurakRules.beats(target, candidate, state.trumpSuit()))
                    .min(cheapestFirst(state.trumpSuit()))
                    .<GameCommand>map(candidate -> new GameCommand.Defend(target, candidate))
                    .orElseGet(GameCommand.TakeCards::new);
        }
        return legalAttack(state).<GameCommand>map(GameCommand.Attack::new).orElseGet(GameCommand.EndAttack::new);
    }

    private static java.util.Optional<Card> legalAttack(DuelState state) {
        if (state.table().size() >= DurakEngine.MAX_ATTACK_CARDS
                || state.undefendedCount() >= state.handOf(state.defenderId()).size()) {
            return java.util.Optional.empty();
        }
        List<Card> hand = state.handOf(state.attackerId());
        if (state.table().isEmpty()) {
            return hand.stream().min(cheapestFirst(state.trumpSuit()));
        }
        var ranksOnTable = new HashSet<Rank>();
        state.table().forEach(pair -> {
            ranksOnTable.add(pair.attack().rank());
            if (pair.isDefended()) {
                ranksOnTable.add(pair.defence().rank());
            }
        });
        return hand.stream()
                .filter(candidate -> ranksOnTable.contains(candidate.rank()))
                .min(cheapestFirst(state.trumpSuit()));
    }

    /** Non-trumps before trumps, low ranks first — a plausible enough strategy to exercise the rules. */
    private static Comparator<Card> cheapestFirst(Suit trumpSuit) {
        return Comparator.<Card, Boolean>comparing(candidate -> candidate.isTrump(trumpSuit))
                .thenComparing(Card::rank);
    }

    private static void assertAllCardsPresent(DuelState state) {
        var all = new ArrayList<Card>();
        all.addAll(state.handA());
        all.addAll(state.handB());
        all.addAll(state.talon());
        all.addAll(state.discard());
        state.table().forEach(pair -> {
            all.add(pair.attack());
            if (pair.isDefended()) {
                all.add(pair.defence());
            }
        });

        assertThat(all).hasSize(Deck.SIZE);
        assertThat(new HashSet<>(all)).hasSize(Deck.SIZE);
    }
}
