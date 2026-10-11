package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.account.repository.PlayerRepository;
import cardwar.account.service.AccountService;
import cardwar.security.PlayerIdentity;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** Password-less accounts provisioned from a verified Telegram identity. */
class TelegramAccountIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    AccountService accounts;

    @Autowired
    PlayerRepository players;

    ApiDriver api;

    @BeforeEach
    void setUp() {
        api = new ApiDriver(mvc, mapper);
    }

    /** Telegram ids are positive 64-bit numbers; a random one keeps tests independent of each other. */
    private static long telegramId() {
        return ThreadLocalRandom.current().nextLong(1_000_000L, 9_999_999_999L);
    }

    @Test
    void firstSignInCreatesAPasswordlessAccountAndRepeatsReturnTheSameOne() {
        long telegramId = telegramId();

        PlayerIdentity first = accounts.registerTelegram(telegramId, "Alice Example");
        PlayerIdentity second = accounts.registerTelegram(telegramId, "Alice Renamed");

        assertThat(second.playerId()).isEqualTo(first.playerId());
        assertThat(first.username()).isEqualTo("tg_" + telegramId);
        var stored = players.findById(first.playerId()).orElseThrow();
        assertThat(stored.getPasswordHash()).isNull();
        assertThat(stored.getTelegramUserId()).isEqualTo(telegramId);
        assertThat(stored.getDisplayName()).isEqualTo("Alice Example");
        assertThat(accounts.progressOf(first.playerId()).duelsPlayed()).isZero();
    }

    @Test
    void aPasswordAccountHoldingTheGeneratedNameDoesNotBlockTelegramSignIn() throws Exception {
        long telegramId = telegramId();
        api.register("tg_" + telegramId);

        PlayerIdentity identity = accounts.registerTelegram(telegramId, "Bob");

        assertThat(identity.username()).startsWith("tg_" + telegramId + "_");
        assertThat(players.findById(identity.playerId())).isPresent();
    }

    @Test
    void blankDisplayNameFallsBackToTheUsername() {
        long telegramId = telegramId();

        PlayerIdentity identity = accounts.registerTelegram(telegramId, "  ");

        assertThat(accounts.summary(identity.playerId()).displayName()).isEqualTo(identity.username());
    }

    @Test
    void passwordLoginOnATelegramOnlyAccountIsTheGeneric401() throws Exception {
        PlayerIdentity identity = accounts.registerTelegram(telegramId(), "Carol");

        String telegramOnly = api.login(identity.username(), ApiDriver.PASSWORD)
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String unknown = api.login(ApiDriver.uniqueUsername("nobody"), ApiDriver.PASSWORD)
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(telegramOnly).isEqualTo(unknown);
    }
}
