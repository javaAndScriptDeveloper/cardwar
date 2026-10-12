package cardwar.session.service;

import cardwar.engine.DuelId;
import cardwar.session.store.GameStateStore;
import cardwar.wallet.service.WalletService;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Returns the stakes of duels nobody finished. A duel both players abandon expires from Redis without a result, so
 * nothing would ever settle its escrow; once an escrow is older than the duel's own lifetime and the duel is gone,
 * both stakes go back. Live here rather than in the wallet because only the session module can see Redis.
 */
@Slf4j
@Service
public class StakeSweepService {

    private final WalletService wallets;
    private final GameStateStore store;
    private final Duration stateTtl;
    private final DuelCompletionService completion;
    private final java.time.Clock clock;

    public StakeSweepService(
            WalletService wallets,
            GameStateStore store,
            @Value("${cardwar.duel.state-ttl}") Duration stateTtl,
            DuelCompletionService completion,
            java.time.Clock clock) {
        this.wallets = wallets;
        this.store = store;
        this.stateTtl = stateTtl;
        this.completion = completion;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${cardwar.duel.stake-sweep-interval:5m}", initialDelayString = "1m")
    public void sweepNow() {
        sweep(clock.instant());
    }

    public void sweep(Instant now) {
        for (String reference : wallets.unsettledEscrows(now.minus(stateTtl))) {
            var duelId = new DuelId(UUID.fromString(reference));
            var stored = store.find(duelId);
            if (stored.isPresent() && stored.get().state().isFinished()) {
                // Decided, but its completion failed after the last move: finish the job (which pays the winner).
                completion.complete(stored.get(), now);
                store.delete(duelId);
                log.info("Completed duel {} whose result had not been recorded", reference);
                continue;
            }
            if (stored.isPresent()) {
                // Still being played (every move refreshes its lifetime); its result will settle it.
                continue;
            }
            wallets.refund(reference);
            log.info("Refunded the stakes of abandoned duel {}", reference);
        }
    }
}
