package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.account.dto.Rank;
import cardwar.account.service.AccountService;
import cardwar.monetization.grant.StreakSource;
import cardwar.session.service.DuelCompletionService;
import cardwar.session.store.StoredDuel;
import cardwar.wallet.service.WalletService;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** Win streaks, XP and ranks: what a finished duel does to each player's progress, and how it is read. */
class ProgressIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DuelCompletionService completion;

    @Autowired
    WalletService wallets;

    @Autowired
    AccountService accounts;

    @Autowired
    StreakSource streaks;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;
    FinishedDuels duels;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
        duels = new FinishedDuels(completion, wallets);
    }

    @Test
    void winsExtendTheStreakAndEarnXpWhileALossBreaksItAndADrawKeepsIt() throws Exception {
        duels.won(alice, bob, 0);
        duels.won(alice, bob, 0);

        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.duelsPlayed").value(2))
                .andExpect(jsonPath("$.duelsWon").value(2))
                .andExpect(jsonPath("$.winStreak").value(2))
                .andExpect(jsonPath("$.bestWinStreak").value(2))
                .andExpect(jsonPath("$.xp").value(60))
                .andExpect(jsonPath("$.rank").value("DURAK"))
                .andExpect(jsonPath("$.nextRankXp").value(100))
                .andExpect(jsonPath("$.streakBonusPercent").value(20));
        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(bob)))
                .andExpect(jsonPath("$.duelsPlayed").value(2))
                .andExpect(jsonPath("$.duelsWon").value(0))
                .andExpect(jsonPath("$.winStreak").value(0))
                .andExpect(jsonPath("$.xp").value(20))
                .andExpect(jsonPath("$.streakBonusPercent").value(0));

        duels.won(bob, alice, 100);

        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.winStreak").value(0))
                .andExpect(jsonPath("$.bestWinStreak").value(2))
                .andExpect(jsonPath("$.xp").value(70));
        // A staked win is worth ten more.
        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(bob)))
                .andExpect(jsonPath("$.winStreak").value(1))
                .andExpect(jsonPath("$.xp").value(60));

        duels.drawn(alice, bob, 0);

        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.duelsPlayed").value(4))
                .andExpect(jsonPath("$.winStreak").value(0))
                .andExpect(jsonPath("$.xp").value(85));
        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(bob)))
                .andExpect(jsonPath("$.winStreak").value(1))
                .andExpect(jsonPath("$.xp").value(75));
    }

    @Test
    void aLongStreakCapsTheBonusAtFiftyPercentAndXpMovesTheRankUp() throws Exception {
        for (int i = 0; i < 6; i++) {
            duels.won(alice, bob, 0);
        }

        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.winStreak").value(6))
                .andExpect(jsonPath("$.bestWinStreak").value(6))
                .andExpect(jsonPath("$.streakBonusPercent").value(50))
                .andExpect(jsonPath("$.xp").value(180))
                .andExpect(jsonPath("$.rank").value("PIDKYDNYI"))
                .andExpect(jsonPath("$.nextRankXp").value(300));
        assertThat(accounts.bestWinStreakOf(alice.id())).isEqualTo(6);
        assertThat(streaks.bestWinStreak(alice.id())).isEqualTo(6);
        assertThat(streaks.bestWinStreak(bob.id())).isZero();
    }

    @Test
    void ranksFollowTheXpThresholds() {
        assertThat(Rank.of(0)).isEqualTo(Rank.DURAK);
        assertThat(Rank.of(99)).isEqualTo(Rank.DURAK);
        assertThat(Rank.of(100)).isEqualTo(Rank.PIDKYDNYI);
        assertThat(Rank.of(300)).isEqualTo(Rank.KOZYR);
        assertThat(Rank.of(700)).isEqualTo(Rank.SHULER);
        assertThat(Rank.of(1500)).isEqualTo(Rank.LEHENDA);
        assertThat(Rank.of(99_999)).isEqualTo(Rank.LEHENDA);
        assertThat(Rank.DURAK.nextXp()).isEqualTo(100);
        assertThat(Rank.LEHENDA.nextXp()).isNull();
    }

    @Test
    void completingTheSameDuelTwiceCountsItOnce() throws Exception {
        StoredDuel duel = duels.decided(alice, bob, 0);
        completion.complete(duel, Instant.now());
        completion.complete(duel, Instant.now());

        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.duelsPlayed").value(1))
                .andExpect(jsonPath("$.winStreak").value(1))
                .andExpect(jsonPath("$.xp").value(30));
    }

    @Test
    void theProfileStillCarriesTheProgressAndTheEndpointNeedsAToken() throws Exception {
        api.me(alice)
                .andExpect(jsonPath("$.progress.currencyBalance").value(500))
                .andExpect(jsonPath("$.progress.rank").value("DURAK"))
                .andExpect(jsonPath("$.progress.nextRankXp").value(100));
        mvc.perform(get("/api/v1/me/progress")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/progress").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.nextRankXp").value(100));
    }
}
