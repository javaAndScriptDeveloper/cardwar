package cardwar.session.service;

import cardwar.session.store.GameStateStore;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Enforces the move clock: once a second, every duel whose deadline has passed gets the timeout move. The deadlines
 * live in Redis with the duels, so a restart loses nothing; a duel whose timeout fails is simply tried next tick.
 */
@Slf4j
@Service
public class DuelClockService {

    private final DuelService duels;
    private final GameStateStore store;
    private final Clock clock;

    public DuelClockService(DuelService duels, GameStateStore store, Clock clock) {
        this.duels = duels;
        this.store = store;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${cardwar.duel.clock-tick:1s}", initialDelayString = "5s")
    public void tick() {
        Instant now = clock.instant();
        for (UUID duelId : store.dueDeadlines(now)) {
            try {
                duels.applyTimeout(duelId, now);
            } catch (RuntimeException failed) {
                log.warn(
                        "Timeout for duel {} failed: {}",
                        duelId,
                        failed.getClass().getSimpleName());
            }
        }
    }
}
