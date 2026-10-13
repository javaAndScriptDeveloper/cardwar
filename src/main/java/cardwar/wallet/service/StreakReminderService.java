package cardwar.wallet.service;

import cardwar.wallet.domain.DailyBonusClaim;
import cardwar.wallet.domain.StreakReminder;
import cardwar.wallet.notify.StreakReminderGateway;
import cardwar.wallet.repository.DailyBonusClaimRepository;
import cardwar.wallet.repository.StreakReminderRepository;
import java.time.Clock;
import java.time.LocalDate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * The evening nudge: at 19:00 Kyiv, everybody with a daily-bonus streak of two or more days who has not claimed today
 * is told it burns at midnight. One message per player per day, recorded in {@code streak_reminder} before it is
 * sent, so a restart or a repeated run cannot send it twice. The send itself is best effort through the gateway.
 *
 * <p>Deliberately not one transaction: each reminder row commits on its own, so a crash halfway leaves the players
 * already nudged marked as such and the rest for the next run.
 */
@Slf4j
@Service
public class StreakReminderService {

    /** A one-day streak is nothing to save; the nudge starts once there is a run going. */
    static final int MIN_STREAK = 2;

    private final DailyBonusClaimRepository claims;
    private final StreakReminderRepository reminders;
    private final StreakReminderGateway gateway;
    private final Clock clock;

    public StreakReminderService(
            DailyBonusClaimRepository claims,
            StreakReminderRepository reminders,
            StreakReminderGateway gateway,
            Clock clock) {
        this.claims = claims;
        this.reminders = reminders;
        this.gateway = gateway;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 19 * * *", zone = "Europe/Kyiv")
    public void remindNow() {
        remind(DailyBonusService.kyivDate(clock.instant()));
    }

    /** Reminds for a given Kyiv day; the clock-free core. Returns how many players were reminded this run. */
    public int remind(LocalDate day) {
        int reminded = 0;
        for (DailyBonusClaim claim : claims.streaksAtRisk(day.minusDays(1), day, MIN_STREAK)) {
            var key = new StreakReminder.Key(claim.getPlayerId(), day);
            if (reminders.existsById(key)) {
                continue;
            }
            reminders.save(new StreakReminder(claim.getPlayerId(), day));
            gateway.remindStreak(claim.getPlayerId(), claim.getStreakDay());
            reminded++;
        }
        log.info("Streak reminders for {}: {}", day, reminded);
        return reminded;
    }
}
