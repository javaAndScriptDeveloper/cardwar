package cardwar.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cardwar.engine.DuelId;
import cardwar.engine.DuelState;
import cardwar.engine.DurakEngine;
import cardwar.engine.GameCommand;
import cardwar.engine.PlayerId;
import cardwar.exception.ConflictException;
import cardwar.integration.AbstractIntegrationTest;
import cardwar.session.store.GameStateStore;
import cardwar.session.store.StoredDuel;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * The state store against a real Redis. TTL and compare-and-set are the two guarantees the whole session design
 * rests on, and neither can be checked without the actual server.
 */
class RedisGameStateStoreIntegrationTest extends AbstractIntegrationTest {

    private static final PlayerId ALICE = new PlayerId(UUID.randomUUID());
    private static final PlayerId BOB = new PlayerId(UUID.randomUUID());

    @Autowired
    GameStateStore store;

    @Autowired
    StringRedisTemplate redis;

    @Autowired
    DurakEngine engine;

    @Value("${cardwar.duel.state-ttl}")
    Duration ttl;

    @Test
    void createSetsTheConfiguredTtl() {
        StoredDuel duel = freshDuel();

        store.save(duel, GameStateStore.ABSENT);

        Long remaining = redis.getExpire(key(duel), TimeUnit.SECONDS);
        assertThat(remaining).isPositive().isLessThanOrEqualTo(ttl.toSeconds()).isGreaterThan(ttl.toSeconds() - 60);
    }

    @Test
    void aMoveRefreshesTheTtl() {
        StoredDuel duel = freshDuel();
        store.save(duel, GameStateStore.ABSENT);
        redis.expire(key(duel), Duration.ofSeconds(30));
        assertThat(redis.getExpire(key(duel), TimeUnit.SECONDS)).isLessThanOrEqualTo(30);

        store.save(afterOneMove(duel), duel.state().version());

        assertThat(redis.getExpire(key(duel), TimeUnit.SECONDS)).isGreaterThan(ttl.toSeconds() - 60);
    }

    @Test
    void findRoundTripsTheStateAndStartTime() {
        StoredDuel duel = freshDuel();
        store.save(duel, GameStateStore.ABSENT);

        StoredDuel found = store.find(duel.state().duelId()).orElseThrow();

        assertThat(found.state()).isEqualTo(duel.state());
        assertThat(found.startedAt()).isEqualTo(duel.startedAt());
    }

    @Test
    void missingDuelIsEmptyAndDeleteRemovesTheKey() {
        StoredDuel duel = freshDuel();
        assertThat(store.find(duel.state().duelId())).isEmpty();

        store.save(duel, GameStateStore.ABSENT);
        store.delete(duel.state().duelId());

        assertThat(store.find(duel.state().duelId())).isEmpty();
        assertThat(redis.hasKey(key(duel))).isFalse();
    }

    @Test
    void savingOverAnExistingDuelAsIfAbsentConflicts() {
        StoredDuel duel = freshDuel();
        store.save(duel, GameStateStore.ABSENT);

        assertThatThrownBy(() -> store.save(duel, GameStateStore.ABSENT)).isInstanceOf(ConflictException.class);
    }

    @Test
    void staleVersionConflictsAndLeavesTheStoredStateUntouched() {
        StoredDuel duel = freshDuel();
        store.save(duel, GameStateStore.ABSENT);
        StoredDuel first = afterOneMove(duel);
        store.save(first, duel.state().version());

        assertThatThrownBy(() -> store.save(afterOneMove(duel), duel.state().version()))
                .isInstanceOf(ConflictException.class);
        assertThat(store.find(duel.state().duelId()).orElseThrow().state()).isEqualTo(first.state());
    }

    @Test
    void concurrentSavesAgainstTheSameVersion_exactlyOneWins() throws Exception {
        StoredDuel duel = freshDuel();
        store.save(duel, GameStateStore.ABSENT);
        long expected = duel.state().version();
        int writers = 8;
        var ready = new CountDownLatch(writers);
        var go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(writers);
        try {
            List<Future<Boolean>> outcomes = new ArrayList<>();
            for (int i = 0; i < writers; i++) {
                StoredDuel attempt = afterOneMove(duel);
                outcomes.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(5, TimeUnit.SECONDS);
                    try {
                        store.save(attempt, expected);
                        return true;
                    } catch (ConflictException lost) {
                        return false;
                    }
                }));
            }
            ready.await(5, TimeUnit.SECONDS);
            go.countDown();

            long winners = 0;
            for (Future<Boolean> outcome : outcomes) {
                if (outcome.get(10, TimeUnit.SECONDS)) {
                    winners++;
                }
            }
            assertThat(winners).isEqualTo(1);
            assertThat(store.find(duel.state().duelId()).orElseThrow().state().version())
                    .isEqualTo(expected + 1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void bothPlayersIndexAnActiveDuelUntilItIsDeleted() {
        var carol = new PlayerId(UUID.randomUUID());
        var dave = new PlayerId(UUID.randomUUID());
        StoredDuel duel = freshDuel(carol, dave);
        store.save(duel, GameStateStore.ABSENT);
        store.save(afterOneMove(duel), duel.state().version());

        assertThat(store.findActive(carol))
                .extracting(found -> found.state().duelId())
                .containsExactly(duelId(duel));
        assertThat(store.findActive(dave))
                .extracting(found -> found.state().version())
                .containsExactly(1L);
        assertThat(redis.getExpire("cardwar:player:" + carol.value() + ":duels", TimeUnit.SECONDS))
                .isGreaterThan(ttl.toSeconds() - 60);

        store.delete(duelId(duel));

        assertThat(store.findActive(carol)).isEmpty();
        assertThat(store.findActive(dave)).isEmpty();
    }

    @Test
    void anExpiredDuelIsDroppedFromTheIndexOnRead() {
        var erin = new PlayerId(UUID.randomUUID());
        StoredDuel expired = freshDuel(erin, new PlayerId(UUID.randomUUID()));
        StoredDuel live = freshDuel(erin, new PlayerId(UUID.randomUUID()));
        store.save(expired, GameStateStore.ABSENT);
        store.save(live, GameStateStore.ABSENT);
        redis.delete(key(expired));

        assertThat(store.findActive(erin))
                .extracting(found -> found.state().duelId())
                .containsExactly(duelId(live));
        assertThat(redis.opsForSet().members("cardwar:player:" + erin.value() + ":duels"))
                .containsExactly(duelId(live).value().toString());
    }

    private static DuelId duelId(StoredDuel duel) {
        return duel.state().duelId();
    }

    private StoredDuel freshDuel() {
        return freshDuel(ALICE, BOB);
    }

    private StoredDuel freshDuel(PlayerId one, PlayerId two) {
        DuelState state = engine.start(new DuelId(UUID.randomUUID()), one, two).state();
        return new StoredDuel(state, Instant.now().minusSeconds(1));
    }

    /** The attacker leads with any card; always legal on an empty table, and it bumps the version by one. */
    private StoredDuel afterOneMove(StoredDuel duel) {
        DuelState state = duel.state();
        PlayerId attacker = state.attackerId();
        var lead = new GameCommand.Attack(state.handOf(attacker).getFirst());
        return duel.with(engine.apply(state, attacker, lead).state());
    }

    private static String key(StoredDuel duel) {
        return "cardwar:duel:" + duel.state().duelId().value();
    }
}
