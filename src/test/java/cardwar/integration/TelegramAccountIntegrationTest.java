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

        PlayerIdentity first = accounts.registerTelegram(telegramId, "Alice Example", "alice", null);
        PlayerIdentity second =
                accounts.registerTelegram(telegramId, "Alice Renamed", "alice2", "https://t.me/i/userpic/320/a.svg");

        assertThat(second.playerId()).isEqualTo(first.playerId());
        assertThat(first.username()).isEqualTo("tg_" + telegramId);
        assertThat(second.username()).isEqualTo(first.username());
        var stored = players.findById(first.playerId()).orElseThrow();
        assertThat(stored.getPasswordHash()).isNull();
        assertThat(stored.getTelegramUserId()).isEqualTo(telegramId);
        // People rename themselves and change photos in Telegram; the account follows, the internal name does not.
        assertThat(stored.getUsername()).isEqualTo("tg_" + telegramId);
        assertThat(stored.getDisplayName()).isEqualTo("Alice Renamed");
        assertThat(stored.getTelegramHandle()).isEqualTo("alice2");
        assertThat(stored.getPhotoUrl()).isEqualTo("https://t.me/i/userpic/320/a.svg");
        assertThat(accounts.progressOf(first.playerId()).duelsPlayed()).isZero();
    }

    @Test
    void aPasswordAccountHoldingTheGeneratedNameDoesNotBlockTelegramSignIn() throws Exception {
        long telegramId = telegramId();
        api.register("tg_" + telegramId);

        PlayerIdentity identity = accounts.registerTelegram(telegramId, "Bob", null, null);

        assertThat(identity.username()).startsWith("tg_" + telegramId + "_");
        assertThat(players.findById(identity.playerId())).isPresent();
    }

    @Test
    void blankDisplayNameFallsBackToTheUsername() {
        long telegramId = telegramId();

        PlayerIdentity identity = accounts.registerTelegram(telegramId, "  ", null, null);

        assertThat(accounts.summary(identity.playerId()).displayName()).isEqualTo(identity.username());
    }

    @Test
    void passwordLoginOnATelegramOnlyAccountIsTheGeneric401() throws Exception {
        PlayerIdentity identity = accounts.registerTelegram(telegramId(), "Carol", null, null);

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
