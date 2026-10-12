package cardwar.wallet.service;

import cardwar.exception.ConflictException;
import cardwar.metrics.GameMetrics;
import cardwar.wallet.domain.DailyBonusClaim;
import cardwar.wallet.dto.BonusClaim;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.dto.DailyBonusView;
import cardwar.wallet.dto.WalletView;
import cardwar.wallet.repository.DailyBonusClaimRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One bonus per calendar day in Kyiv, growing with a streak of consecutive days and resetting after a missed one.
 * The claim row's primary key (player, date) is what stops a double tap or a second device from claiming twice.
 */
@Service
public class DailyBonusService {

    public static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    public static final String ALREADY_CLAIMED = "BONUS_ALREADY_CLAIMED";
    private static final long[] AMOUNTS = {50, 75, 100, 150, 200, 300, 500};

    private final DailyBonusClaimRepository claims;
    private final WalletService wallets;
    private final GameMetrics metrics;
    private final Clock clock;

    public DailyBonusService(
            DailyBonusClaimRepository claims, WalletService wallets, GameMetrics metrics, Clock clock) {
        this.claims = claims;
        this.wallets = wallets;
        this.metrics = metrics;
        this.clock = clock;
    }

    public static LocalDate kyivDate(Instant instant) {
        return instant.atZone(KYIV).toLocalDate();
    }

    static long amountFor(int streakDay) {
        return AMOUNTS[Math.min(streakDay, AMOUNTS.length) - 1];
    }

    @Transactional(readOnly = true)
    public WalletView view(UUID playerId) {
        LocalDate today = kyivDate(clock.instant());
        var last = claims.findTopByPlayerIdOrderByBonusDateDesc(playerId);
        DailyBonusView bonus;
        if (last.isPresent() && last.get().getBonusDate().equals(today)) {
            Instant next = today.plusDays(1).atStartOfDay(KYIV).toInstant();
            bonus = new DailyBonusView(false, last.get().getAmount(), last.get().getStreakDay(), next);
        } else {
            int streak = last.filter(claim -> claim.getBonusDate().equals(today.minusDays(1)))
                    .map(claim -> claim.getStreakDay() + 1)
                    .orElse(1);
            bonus = new DailyBonusView(true, amountFor(streak), streak, null);
        }
        return new WalletView(wallets.balance(playerId), bonus);
    }

    @Transactional
    public WalletView claim(UUID playerId) {
        claimOn(playerId, kyivDate(clock.instant()));
        return view(playerId);
    }

    /** The claim for a given Kyiv date; the clock-free core of {@link #claim}. */
    @Transactional
    public BonusClaim claimOn(UUID playerId, LocalDate date) {
        if (claims.existsById(new DailyBonusClaim.Key(playerId, date))) {
            throw new ConflictException("Today's bonus has already been claimed", ALREADY_CLAIMED);
        }
        int streak = claims.findById(new DailyBonusClaim.Key(playerId, date.minusDays(1)))
                .map(previous -> previous.getStreakDay() + 1)
                .orElse(1);
        long amount = amountFor(streak);
        try {
            claims.saveAndFlush(new DailyBonusClaim(playerId, date, streak, amount, clock.instant()));
        } catch (DataIntegrityViolationException raced) {
            throw new ConflictException("Today's bonus has already been claimed", ALREADY_CLAIMED);
        }
        wallets.credit(playerId, amount, CoinKind.DAILY_BONUS, date.toString());
        metrics.bonusClaimed(streak);
        return new BonusClaim(date, streak, amount);
    }
}
