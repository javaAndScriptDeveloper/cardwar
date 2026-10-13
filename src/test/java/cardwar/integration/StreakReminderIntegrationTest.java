package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;

import cardwar.account.service.AccountService;
import cardwar.security.PlayerIdentity;
import cardwar.support.RecordingTelegramBotApi;
import cardwar.wallet.service.DailyBonusService;
import cardwar.wallet.service.StreakReminderService;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * The evening nudge: whoever has a bonus streak to lose and has not claimed today gets one DM, once. The day is
 * passed in, so the test owns a date no other test claims on, and the DM is read from the recording Bot API.
 */
class StreakReminderIntegrationTest extends AbstractIntegrationTest {

    /** A day no other test touches: the suite claims bonuses on the real today and on days near it. */
    private static final LocalDate DAY = LocalDate.of(2031, 3, 5);

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    StreakReminderService reminders;

    @Autowired
    DailyBonusService bonuses;

    @Autowired
    AccountService accounts;

    @Autowired
    RecordingTelegramBotApi telegram;

    ApiDriver api;

    @BeforeEach
    void setUp() {
        api = new ApiDriver(mvc, mapper);
    }

    private static long telegramId() {
        return ThreadLocalRandom.current().nextLong(1_000_000L, 9_999_999_999L);
    }

    private PlayerIdentity telegramPlayer() {
        return accounts.registerTelegram(telegramId(), "Ann", null, null);
    }

    private void claimed(UUID playerId, int... daysAgo) {
        for (int days : daysAgo) {
            bonuses.claimOn(playerId, DAY.minusDays(days));
        }
    }

    private long chatOf(PlayerIdentity player) {
        return accounts.telegramUserIdOf(player.playerId()).orElseThrow();
    }

    @Test
    void remindsOnceWhoeverHasAStreakToLoseAndNoClaimYet() throws Exception {
        PlayerIdentity atRisk = telegramPlayer();
        claimed(atRisk.playerId(), 2, 1);
        PlayerIdentity longStreak = telegramPlayer();
        claimed(longStreak.playerId(), 5, 4, 3, 2, 1);
        PlayerIdentity claimedToday = telegramPlayer();
        claimed(claimedToday.playerId(), 2, 1, 0);
        PlayerIdentity firstDay = telegramPlayer();
        claimed(firstDay.playerId(), 1);
        PlayerIdentity lapsed = telegramPlayer();
        claimed(lapsed.playerId(), 3, 2);
        // A password account has no chat to write to; it must simply be skipped.
        ApiDriver.Player noTelegram = api.register(ApiDriver.uniqueUsername("nochat"));
        claimed(noTelegram.id(), 2, 1);

        assertThat(reminders.remind(DAY)).isEqualTo(3);

        assertThat(telegram.sentTo(chatOf(atRisk))).singleElement().satisfies(dm -> {
            assertThat(dm.text()).isEqualTo("🔥 Серія 2 дні згорить опівночі. Забери бонус");
            assertThat(dm.buttonText()).isEqualTo("Грати");
            assertThat(dm.buttonUrl()).endsWith("/app/");
        });
        assertThat(telegram.sentTo(chatOf(longStreak)))
                .singleElement()
                .extracting(RecordingTelegramBotApi.Sent::text)
                .isEqualTo("🔥 Серія 5 днів згорить опівночі. Забери бонус");
        assertThat(telegram.sentTo(chatOf(claimedToday))).isEmpty();
        assertThat(telegram.sentTo(chatOf(firstDay))).isEmpty();
        assertThat(telegram.sentTo(chatOf(lapsed))).isEmpty();

        // A second run the same evening (a restart, a retried job) sends nothing more.
        assertThat(reminders.remind(DAY)).isZero();
        assertThat(telegram.sentTo(chatOf(atRisk))).hasSize(1);
        assertThat(telegram.sentTo(chatOf(longStreak))).hasSize(1);
    }
}
