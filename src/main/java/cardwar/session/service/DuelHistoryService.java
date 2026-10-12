package cardwar.session.service;

import cardwar.account.service.AccountService;
import cardwar.exception.NotFoundException;
import cardwar.session.domain.DuelResult;
import cardwar.session.dto.DuelHistoryEntry;
import cardwar.session.dto.PlayerProfileView;
import cardwar.session.repository.DuelResultRepository;
import cardwar.wallet.service.WalletService;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A player's own record of finished duels, newest first. Read-only over {@code duel_result}; the opponent's
 * profile (name, handle, photo) is looked up per row because the result row deliberately stores ids only, and fifty lookups on a
 * capped page is cheaper than a join the rest of the module never needs.
 */
@Service
public class DuelHistoryService {

    /** More than this and a client should be paging, which the endpoint does not offer yet. */
    static final int PAGE_SIZE = 50;

    /** Shown when the opponent's account has since disappeared; the duel still happened. */
    static final String UNKNOWN_OPPONENT = "unknown";

    private final DuelResultRepository results;
    private final AccountService accounts;

    private final WalletService wallets;

    public DuelHistoryService(DuelResultRepository results, AccountService accounts, WalletService wallets) {
        this.results = results;
        this.accounts = accounts;
        this.wallets = wallets;
    }

    @Transactional(readOnly = true)
    public List<DuelHistoryEntry> historyOf(UUID playerId) {
        return results
                .findByPlayerAOrPlayerBOrderByFinishedAtDesc(playerId, playerId, PageRequest.of(0, PAGE_SIZE))
                .stream()
                .map(row -> entryFor(playerId, row))
                .toList();
    }

    private DuelHistoryEntry entryFor(UUID playerId, DuelResult row) {
        UUID opponentId = playerId.equals(row.getPlayerA()) ? row.getPlayerB() : row.getPlayerA();
        PlayerProfileView opponent = profileOf(opponentId);
        return new DuelHistoryEntry(
                row.getDuelId(),
                opponentId,
                opponent.username(),
                opponent.displayName(),
                opponent.handle(),
                opponent.photoUrl(),
                resultFor(playerId, row),
                row.getEndReason(),
                row.getStartedAt(),
                row.getFinishedAt(),
                row.getMoveCount(),
                row.getStake(),
                row.getStake() == 0
                        ? 0
                        : wallets.netFor(playerId, row.getDuelId().toString()));
    }

    private static String resultFor(UUID playerId, DuelResult row) {
        if (row.isDraw()) {
            return "DRAW";
        }
        return playerId.equals(row.getWinnerId()) ? "WON" : "LOST";
    }

    private PlayerProfileView profileOf(UUID opponentId) {
        try {
            return PlayerProfileView.of(accounts.summary(opponentId));
        } catch (NotFoundException e) {
            return new PlayerProfileView(UNKNOWN_OPPONENT, UNKNOWN_OPPONENT, null, null);
        }
    }
}
