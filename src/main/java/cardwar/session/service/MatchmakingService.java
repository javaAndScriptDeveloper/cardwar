package cardwar.session.service;

import cardwar.engine.DuelId;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.metrics.GameMetrics;
import cardwar.metrics.GameMetrics.MatchmakingEvent;
import cardwar.session.domain.MatchmakingEntry;
import cardwar.session.dto.MatchView;
import cardwar.session.repository.MatchmakingEntryRepository;
import cardwar.wallet.service.WalletService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Quick match by stake table. Entering pairs the caller with the longest-waiting player at the same table, or queues
 * them. Pairing escrows both stakes and starts the duel in one transaction under an advisory lock per table, so two
 * players entering at once always pair, and a duel that fails to start leaves nobody charged.
 */
@Slf4j
@Service
public class MatchmakingService {

    private final MatchmakingEntryRepository entries;
    private final WalletService wallets;
    private final DuelService duels;
    private final GameMetrics metrics;
    private final Clock clock;
    private final Duration entryTtl;

    public MatchmakingService(
            MatchmakingEntryRepository entries,
            WalletService wallets,
            DuelService duels,
            GameMetrics metrics,
            Clock clock,
            @Value("${cardwar.matchmaking.entry-ttl:60s}") Duration entryTtl) {
        this.entries = entries;
        this.wallets = wallets;
        this.duels = duels;
        this.metrics = metrics;
        this.clock = clock;
        this.entryTtl = entryTtl;
    }

    @Transactional
    public MatchView enter(PlayerId caller, long stake) {
        if (!DuelInviteService.STAKES.contains(stake)) {
            throw new BadRequestException("Stakes are 0, 100, 500, 1000 or 5000 coins", "INVALID_STAKE");
        }
        if (wallets.balance(caller.value()) < stake) {
            throw new BadRequestException("Not enough coins for this stake", WalletService.INSUFFICIENT_COINS);
        }
        entries.lockTable(stake);
        Instant now = clock.instant();
        Optional<MatchmakingEntry> own = entries.findById(caller.value());
        if (own.isPresent() && own.get().getMatchedDuelId() != null) {
            return consume(own.get());
        }
        own.ifPresent(entries::delete);
        entries.flush();

        while (true) {
            Optional<MatchmakingEntry> found = entries.oldestWaiting(stake, caller.value(), now.minus(entryTtl));
            if (found.isEmpty()) {
                entries.save(new MatchmakingEntry(caller.value(), stake, now));
                metrics.matchmaking(MatchmakingEvent.ENTERED);
                return new MatchView(MatchView.Status.WAITING, stake, now, null);
            }
            MatchmakingEntry other = found.get();
            if (wallets.balance(other.getPlayerId()) < stake) {
                // They spent their coins while waiting: they cannot sit at this table any more.
                entries.delete(other);
                entries.flush();
                continue;
            }
            var duelId = new DuelId(UUID.randomUUID());
            wallets.escrow(duelId.value().toString(), stake, other.getPlayerId(), caller.value());
            other.matched(duelId.value());
            duels.startQuickMatch(caller, new PlayerId(other.getPlayerId()), duelId, stake);
            metrics.matchmaking(MatchmakingEvent.MATCHED);
            metrics.matchmakingWait(Duration.between(other.getCreatedAt(), now));
            log.info("Quick match at table {} started duel {}", stake, duelId.value());
            return new MatchView(MatchView.Status.MATCHED, stake, now, duelId.value());
        }
    }

    /** The caller's place in the queue; empty when they are not queued (204). */
    @Transactional
    public Optional<MatchView> status(PlayerId caller) {
        Optional<MatchmakingEntry> own = entries.findById(caller.value());
        if (own.isEmpty()) {
            return Optional.empty();
        }
        MatchmakingEntry entry = own.get();
        if (entry.getMatchedDuelId() != null) {
            return Optional.of(consume(entry));
        }
        if (entry.getCreatedAt().isBefore(clock.instant().minus(entryTtl))) {
            entries.delete(entry);
            metrics.matchmaking(MatchmakingEvent.EXPIRED);
            return Optional.of(new MatchView(MatchView.Status.EXPIRED, entry.getStake(), entry.getCreatedAt(), null));
        }
        return Optional.of(new MatchView(MatchView.Status.WAITING, entry.getStake(), entry.getCreatedAt(), null));
    }

    @Transactional
    public void leave(PlayerId caller) {
        entries.findById(caller.value())
                .filter(entry -> entry.getMatchedDuelId() == null)
                .ifPresent(entry -> {
                    entries.delete(entry);
                    metrics.matchmaking(MatchmakingEvent.LEFT);
                });
    }

    /** A match is reported once; after that the active duel is how the app finds it. */
    private MatchView consume(MatchmakingEntry entry) {
        entries.delete(entry);
        return new MatchView(
                MatchView.Status.MATCHED, entry.getStake(), entry.getCreatedAt(), entry.getMatchedDuelId());
    }
}
