package cardwar.session.service;

import cardwar.account.dto.DuelOutcomeKind;
import cardwar.account.service.AccountService;
import cardwar.engine.Outcome;
import cardwar.session.domain.DuelResult;
import cardwar.session.repository.DuelResultRepository;
import cardwar.session.store.StoredDuel;
import cardwar.wallet.service.MissionService;
import cardwar.wallet.service.WalletService;
import java.time.Instant;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns a finished duel into the one row Postgres keeps, and bumps both players' progress, pays the pot and steps
 * the daily missions in the same transaction — a result without the progress it implies would be a quietly wrong
 * leaderboard later. The result row's existence guards the whole block, which is what lets the sweep and the last
 * move both call this for the same duel without anything counting twice.
 *
 * <p>Separate from {@link DuelService} so the transaction is a real proxied boundary rather than a self-call
 * that silently runs without one.
 */
@Slf4j
@Service
public class DuelCompletionService {

    private final DuelResultRepository results;
    private final AccountService accounts;
    private final WalletService wallets;
    private final MissionService missions;

    public DuelCompletionService(
            DuelResultRepository results, AccountService accounts, WalletService wallets, MissionService missions) {
        this.results = results;
        this.accounts = accounts;
        this.wallets = wallets;
        this.missions = missions;
    }

    /** Idempotent: a retry after a crashed completion must not double-count anybody's duels. */
    @Transactional
    public void complete(StoredDuel duel, Instant finishedAt) {
        var state = duel.state();
        UUID duelId = state.duelId().value();
        if (results.existsByDuelId(duelId)) {
            return;
        }
        Outcome outcome = state.outcome();
        UUID playerA = state.playerA().value();
        UUID playerB = state.playerB().value();
        UUID winner = outcome.winner() == null ? null : outcome.winner().value();
        UUID loser = outcome.loser() == null ? null : outcome.loser().value();

        results.save(new DuelResult(
                UUID.randomUUID(),
                duelId,
                playerA,
                playerB,
                winner,
                loser,
                outcome.draw(),
                outcome.reason().name(),
                duel.startedAt(),
                finishedAt,
                duel.moveCount(),
                duel.stake()));

        boolean staked = duel.stake() > 0;
        // The bonus is for the streak the winner brought to the table, read before this win extends it.
        int streakBefore = winner == null ? 0 : accounts.progressOf(winner).winStreak();
        accounts.recordDuelPlayed(playerA, outcomeFor(playerA, outcome), staked);
        accounts.recordDuelPlayed(playerB, outcomeFor(playerB, outcome), staked);
        // Same transaction as the result row: the pot is paid exactly when the result becomes durable.
        wallets.settle(duelId.toString(), winner, streakBefore);
        missions.record(playerA, playerA.equals(winner), duel.stake());
        missions.record(playerB, playerB.equals(winner), duel.stake());
        log.info("Duel {} finished after {} moves", duelId, duel.moveCount());
    }

    private static DuelOutcomeKind outcomeFor(UUID player, Outcome outcome) {
        if (outcome.draw()) {
            return DuelOutcomeKind.DRAW;
        }
        return outcome.winner().value().equals(player) ? DuelOutcomeKind.WIN : DuelOutcomeKind.LOSS;
    }
}
