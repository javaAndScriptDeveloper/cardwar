package cardwar.wallet.service;

import cardwar.exception.BadRequestException;
import cardwar.exception.NotFoundException;
import cardwar.metrics.GameMetrics;
import cardwar.wallet.domain.CoinTransaction;
import cardwar.wallet.domain.Wallet;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.dto.CoinTransactionView;
import cardwar.wallet.repository.CoinTransactionRepository;
import cardwar.wallet.repository.WalletRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only writer of coins. Every movement is one ledger row plus the matching change to the wallet's running
 * total, in one transaction under the wallet's row lock; a movement whose (player, kind, reference) already exists is
 * a no-op, which is what makes retries and replays safe.
 */
@Slf4j
@Service
public class WalletService {

    public static final long STARTER_COINS = 500;
    public static final String INSUFFICIENT_COINS = "INSUFFICIENT_COINS";
    static final int MAX_BONUS_STREAK = 5;

    private final WalletRepository wallets;
    private final CoinTransactionRepository ledger;
    private final GameMetrics metrics;
    private final Clock clock;

    public WalletService(WalletRepository wallets, CoinTransactionRepository ledger, GameMetrics metrics, Clock clock) {
        this.wallets = wallets;
        this.ledger = ledger;
        this.metrics = metrics;
        this.clock = clock;
    }

    /** Gives a new player a wallet with the starter coins. Safe to call again. */
    @Transactional
    public void open(UUID playerId) {
        if (wallets.existsById(playerId)) {
            return;
        }
        wallets.saveAndFlush(new Wallet(playerId, clock.instant()));
        credit(playerId, STARTER_COINS, CoinKind.STARTER, "starter");
    }

    @Transactional(readOnly = true)
    public long balance(UUID playerId) {
        return wallets.findById(playerId)
                .map(Wallet::getBalance)
                .orElseThrow(() -> new NotFoundException("No wallet for this player"));
    }

    /** The ledger's own sum; equal to the balance unless something wrote around this service. */
    @Transactional(readOnly = true)
    public long ledgerSum(UUID playerId) {
        return ledger.sumByPlayer(playerId);
    }

    @Transactional(readOnly = true)
    public List<CoinTransactionView> transactions(UUID playerId) {
        return ledger.findTop50ByPlayerIdOrderByCreatedAtDesc(playerId).stream()
                .map(row -> new CoinTransactionView(row.getAmount(), row.getKind(), row.getCreatedAt()))
                .toList();
    }

    /** Adds coins; false when this (kind, reference) was already applied. */
    @Transactional
    public boolean credit(UUID playerId, long amount, CoinKind kind, String reference) {
        requireNonNegative(amount);
        return apply(lock(playerId), amount, kind, reference);
    }

    /** Takes coins, or refuses with 400 {@value #INSUFFICIENT_COINS}; false when already applied. */
    @Transactional
    public boolean debit(UUID playerId, long amount, CoinKind kind, String reference) {
        requireNonNegative(amount);
        Wallet wallet = lock(playerId);
        if (ledger.existsByPlayerIdAndKindAndReference(playerId, kind, reference)) {
            return false;
        }
        if (wallet.getBalance() < amount) {
            throw new BadRequestException("Not enough coins", INSUFFICIENT_COINS);
        }
        return apply(wallet, -amount, kind, reference);
    }

    /**
     * Takes the stake from both players or from neither. Wallets are locked in id order so two escrows involving
     * the same players can never deadlock.
     */
    @Transactional
    public void escrow(String duelReference, long stake, UUID first, UUID second) {
        if (stake == 0) {
            return;
        }
        List<Wallet> locked = Stream.of(first, second)
                .sorted(Comparator.naturalOrder())
                .map(this::lock)
                .toList();
        for (Wallet wallet : locked) {
            if (wallet.getBalance() < stake) {
                throw new BadRequestException("Not enough coins for this stake", INSUFFICIENT_COINS);
            }
        }
        for (Wallet wallet : locked) {
            apply(wallet, -stake, CoinKind.STAKE_ESCROW, duelReference);
        }
        log.info("Escrowed {} from both players of duel {}", stake, duelReference);
    }

    /** Pays the pot to the winner, or returns each stake when {@code winner} is null (a draw). Safe to repeat. */
    @Transactional
    public void settle(String duelReference, UUID winner) {
        settle(duelReference, winner, 0);
    }

    /**
     * {@link #settle(String, UUID)} plus the streak bonus: a winner who was already on {@code streakBeforeWin} wins
     * gets {@link #streakBonus} from the house on top of the pot. It is paid in the same guarded pass as the pot, so a
     * repeated settlement pays neither again; a draw has no winner and so no bonus.
     */
    @Transactional
    public void settle(String duelReference, UUID winner, int streakBeforeWin) {
        List<CoinTransaction> escrows = lockEscrowed(duelReference);
        if (escrows.isEmpty() || alreadySettled(duelReference)) {
            return;
        }
        if (winner == null) {
            refundEscrows(escrows, duelReference);
            return;
        }
        long pot = escrows.stream().mapToLong(row -> -row.getAmount()).sum();
        credit(winner, pot, CoinKind.STAKE_PAYOUT, duelReference);
        long stake = escrows.stream()
                .filter(row -> row.getPlayerId().equals(winner))
                .mapToLong(row -> -row.getAmount())
                .sum();
        long bonus = streakBonus(stake, streakBeforeWin);
        if (bonus > 0) {
            credit(winner, bonus, CoinKind.STREAK_BONUS, streakReference(duelReference));
        }
        log.info("Paid the pot of duel {} to the winner (streak bonus {})", duelReference, bonus);
    }

    /** 10% of the stake per win already on the streak, capped at five wins (50%). */
    public static long streakBonus(long stake, int streakBeforeWin) {
        return stake * 10 * Math.min(Math.max(streakBeforeWin, 0), MAX_BONUS_STREAK) / 100;
    }

    private static String streakReference(String duelReference) {
        return "duel:" + duelReference + ":streak";
    }

    /** Returns each escrowed stake. Safe to repeat; used for draws and for duels nobody finished. */
    @Transactional
    public void refund(String duelReference) {
        List<CoinTransaction> escrows = lockEscrowed(duelReference);
        if (escrows.isEmpty() || alreadySettled(duelReference)) {
            return;
        }
        refundEscrows(escrows, duelReference);
    }

    /**
     * A duel's stakes end exactly one way: paid to a winner or returned. Payout and refund are different ledger kinds,
     * so the per-kind idempotency key alone would let both happen (a sweep racing a late finish); both paths take the
     * participants' wallet locks and then check for either outcome.
     */
    private boolean alreadySettled(String duelReference) {
        return ledger.existsByReferenceAndKindIn(duelReference, List.of(CoinKind.STAKE_PAYOUT, CoinKind.STAKE_REFUND));
    }

    private List<CoinTransaction> lockEscrowed(String duelReference) {
        List<CoinTransaction> escrows = ledger.findByReferenceAndKind(duelReference, CoinKind.STAKE_ESCROW);
        escrows.stream().map(CoinTransaction::getPlayerId).sorted().distinct().forEach(this::lock);
        return escrows;
    }

    private void refundEscrows(List<CoinTransaction> escrows, String duelReference) {
        for (CoinTransaction escrow : escrows) {
            credit(escrow.getPlayerId(), -escrow.getAmount(), CoinKind.STAKE_REFUND, duelReference);
        }
        log.info("Refunded the stakes of duel {}", duelReference);
    }

    @Transactional(readOnly = true)
    public List<String> unsettledEscrows(Instant before) {
        return ledger.unsettledEscrowReferences(before);
    }

    /** What this duel did to this player's coins, net: stake, payout or refund, and the streak bonus if any. */
    @Transactional(readOnly = true)
    public long netFor(UUID playerId, String duelReference) {
        return ledger.sumByPlayerAndReferenceIn(playerId, List.of(duelReference, streakReference(duelReference)));
    }

    private boolean apply(Wallet wallet, long amount, CoinKind kind, String reference) {
        if (ledger.existsByPlayerIdAndKindAndReference(wallet.getPlayerId(), kind, reference)) {
            return false;
        }
        Instant now = clock.instant();
        ledger.save(new CoinTransaction(wallet.getPlayerId(), amount, kind, reference, now));
        wallet.apply(amount, now);
        metrics.coins(kind, amount);
        return true;
    }

    private Wallet lock(UUID playerId) {
        return wallets.lock(playerId).orElseThrow(() -> new NotFoundException("No wallet for this player"));
    }

    private static void requireNonNegative(long amount) {
        if (amount < 0) {
            throw new BadRequestException("Amount must not be negative");
        }
    }
}
