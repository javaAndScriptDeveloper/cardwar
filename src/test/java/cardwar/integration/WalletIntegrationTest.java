package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.DailyBonusService;
import cardwar.wallet.service.WalletService;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/** Coins: the ledger, the wallet balance it backs, and the daily bonus. */
class WalletIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    WalletService wallets;

    @Autowired
    DailyBonusService bonuses;

    ApiDriver api;
    ApiDriver.Player alice;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
    }

    private ResultActions wallet(ApiDriver.Player player) throws Exception {
        return mvc.perform(get("/api/v1/wallet").headers(api.bearer(player)));
    }

    @Test
    void aNewPlayerStartsWithFiveHundredCoinsAndABonusToClaim() throws Exception {
        wallet(alice)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balance").value(500))
                .andExpect(jsonPath("$.dailyBonus.available").value(true))
                .andExpect(jsonPath("$.dailyBonus.amount").value(50))
                .andExpect(jsonPath("$.dailyBonus.streakDay").value(1));
        mvc.perform(get("/api/v1/wallet/transactions").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].kind").value("STARTER"))
                .andExpect(jsonPath("$[0].amount").value(500));
        api.me(alice).andExpect(jsonPath("$.progress.currencyBalance").value(500));
    }

    @Test
    void theBonusIsClaimedOncePerDay() throws Exception {
        mvc.perform(post("/api/v1/wallet/daily-bonus").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balance").value(550))
                .andExpect(jsonPath("$.dailyBonus.available").value(false))
                .andExpect(jsonPath("$.dailyBonus.nextAt").exists());

        mvc.perform(post("/api/v1/wallet/daily-bonus").headers(api.bearer(alice)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.reason").value("BONUS_ALREADY_CLAIMED"));
        wallet(alice).andExpect(jsonPath("$.balance").value(550));
    }

    @Test
    void theStreakGrowsDayByDayCapsAtTheLastAmountAndResetsAfterAGap() {
        LocalDate day = LocalDate.of(2026, 1, 1);
        int[] expected = {50, 75, 100, 150, 200, 300, 500, 500, 500};
        long balance = wallets.balance(alice.id());
        for (int i = 0; i < expected.length; i++) {
            var claim = bonuses.claimOn(alice.id(), day.plusDays(i));
            assertThat(claim.amount()).as("day %d", i + 1).isEqualTo(expected[i]);
            balance += expected[i];
        }
        assertThat(wallets.balance(alice.id())).isEqualTo(balance);

        var afterGap = bonuses.claimOn(alice.id(), day.plusDays(expected.length + 1));
        assertThat(afterGap.streakDay()).isEqualTo(1);
        assertThat(afterGap.amount()).isEqualTo(50);
    }

    @Test
    void theBonusDayFollowsKyivNotUtc() {
        // 21:30 UTC in October is 00:30 the next day in Kyiv (UTC+3).
        assertThat(DailyBonusService.kyivDate(Instant.parse("2026-10-12T21:30:00Z")))
                .isEqualTo(LocalDate.of(2026, 10, 13));
        assertThat(DailyBonusService.kyivDate(Instant.parse("2026-10-12T20:30:00Z")))
                .isEqualTo(LocalDate.of(2026, 10, 12));
    }

    @Test
    void aDebitBelowZeroIsRefusedAndChangesNothing() {
        assertThatThrownBy(() -> wallets.debit(alice.id(), 501, CoinKind.PURCHASE, "too-much"))
                .isInstanceOf(BadRequestException.class)
                .extracting("reason")
                .isEqualTo("INSUFFICIENT_COINS");
        assertThat(wallets.balance(alice.id())).isEqualTo(500);
    }

    @Test
    void aMovementWithTheSameKeyIsAppliedOnce() {
        assertThat(wallets.credit(alice.id(), 40, CoinKind.ADJUSTMENT, "once")).isTrue();
        assertThat(wallets.credit(alice.id(), 40, CoinKind.ADJUSTMENT, "once")).isFalse();

        assertThat(wallets.balance(alice.id())).isEqualTo(540);
        assertThat(wallets.ledgerSum(alice.id())).isEqualTo(540);
    }

    @Test
    void aDoubleClaimThroughTheServiceIsAConflict() {
        LocalDate day = LocalDate.of(2026, 3, 1);
        bonuses.claimOn(alice.id(), day);
        assertThatThrownBy(() -> bonuses.claimOn(alice.id(), day)).isInstanceOf(ConflictException.class);
    }

    @Test
    void theWalletNeedsAToken() throws Exception {
        mvc.perform(get("/api/v1/wallet")).andExpect(status().isUnauthorized());
    }
}
