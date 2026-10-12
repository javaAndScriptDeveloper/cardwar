package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.security.telegram.TelegramInitDataSigner;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/** Exchanging Telegram's signed initData for our own bearer token, through the real filter chain. */
class TelegramAuthIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    ApiDriver api;

    @BeforeEach
    void setUp() {
        api = new ApiDriver(mvc, mapper);
    }

    private ResultActions signIn(String initData) throws Exception {
        return mvc.perform(post("/api/v1/auth/telegram")
                .contentType(MediaType.APPLICATION_JSON)
                .content(api.json(Map.of("initData", initData))));
    }

    private static String initDataFor(long telegramId) {
        return TelegramInitDataSigner.forUser(
                TelegramInitDataSigner.BOT_TOKEN,
                telegramId,
                "Tess",
                Instant.now().getEpochSecond());
    }

    @Test
    void validInitDataYieldsATokenThatWorksOnTheProfile() throws Exception {
        long telegramId = ThreadLocalRandom.current().nextLong(1_000_000L, 9_999_999_999L);

        var body = api.readBody(signIn(initDataFor(telegramId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("tg_" + telegramId))
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.expiresAt").isString()));
        var player = new ApiDriver.Player(
                UUID.fromString((String) body.get("playerId")), (String) body.get("username"), (String)
                        body.get("token"));

        api.me(player)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.player.id").value(player.id().toString()))
                .andExpect(jsonPath("$.player.displayName").value("Tess Tester"));

        var again = api.readBody(signIn(initDataFor(telegramId)).andExpect(status().isOk()));
        assertThat(again.get("playerId")).isEqualTo(player.id().toString());
    }

    @Test
    void everySignInRefreshesTheNameHandleAndPhotoButNeverTheUsername() throws Exception {
        long telegramId = ThreadLocalRandom.current().nextLong(1_000_000L, 9_999_999_999L);
        var player = api.signInTelegram("{\"id\":" + telegramId + ",\"first_name\":\"Olena\",\"username\":\"olena\","
                + "\"photo_url\":\"https://t.me/i/userpic/320/olena.svg\"}");

        api.me(player)
                .andExpect(jsonPath("$.player.username").value("tg_" + telegramId))
                .andExpect(jsonPath("$.player.displayName").value("Olena"))
                .andExpect(jsonPath("$.player.handle").value("olena"))
                .andExpect(jsonPath("$.player.photoUrl").value("https://t.me/i/userpic/320/olena.svg"));

        var renamed = api.signInTelegram("{\"id\":" + telegramId + ",\"first_name\":\"Olena\",\"last_name\":\"K\"}");

        assertThat(renamed.id()).isEqualTo(player.id());
        api.me(renamed)
                .andExpect(jsonPath("$.player.username").value("tg_" + telegramId))
                .andExpect(jsonPath("$.player.displayName").value("Olena K"))
                .andExpect(jsonPath("$.player.handle").doesNotExist())
                .andExpect(jsonPath("$.player.photoUrl").doesNotExist());
    }

    @Test
    void forgedInitDataIsTheGeneric401() throws Exception {
        String forged = TelegramInitDataSigner.forUser(
                "111:some-other-bot", 5L, "Mallory", Instant.now().getEpochSecond());

        signIn(forged)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid credentials"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void missingInitDataIsA400() throws Exception {
        mvc.perform(post("/api/v1/auth/telegram")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }
}
