package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** Telegram names, handles and photos reach every place a client shows another player. */
class TelegramProfileIntegrationTest extends AbstractIntegrationTest {

    private static final String PHOTO = "https://t.me/i/userpic/320/olena.svg";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    ApiDriver api;
    ApiDriver.Player olena;
    ApiDriver.Player taras;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        olena = api.signInTelegram("{\"id\":" + telegramId()
                + ",\"first_name\":\"Olena\",\"last_name\":\"K\",\"username\":\"olena_k\",\"photo_url\":\"" + PHOTO
                + "\"}");
        taras = api.signInTelegram("{\"id\":" + telegramId() + ",\"first_name\":\"Taras\"}");
    }

    private static long telegramId() {
        return ThreadLocalRandom.current().nextLong(1_000_000L, 9_999_999_999L);
    }

    @Test
    void theOpponentsProfileShowsAtTheTableInTheListAndInTheHistory() throws Exception {
        String inviteId = (String) api.readBody(api.createInvite(taras)).get("inviteId");
        UUID duelId = api.duelView(api.acceptInvite(olena, inviteId)).duelId();

        api.viewDuel(taras, duelId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.opponentProfile.username").value(olena.username()))
                .andExpect(jsonPath("$.opponentProfile.displayName").value("Olena K"))
                .andExpect(jsonPath("$.opponentProfile.handle").value("olena_k"))
                .andExpect(jsonPath("$.opponentProfile.photoUrl").value(PHOTO));
        api.viewDuel(olena, duelId)
                .andExpect(jsonPath("$.opponentProfile.displayName").value("Taras"))
                .andExpect(jsonPath("$.opponentProfile.handle").doesNotExist())
                .andExpect(jsonPath("$.opponentProfile.photoUrl").doesNotExist());
        api.activeDuels(taras)
                .andExpect(jsonPath("$[0].opponentUsername").value(olena.username()))
                .andExpect(jsonPath("$[0].opponentDisplayName").value("Olena K"))
                .andExpect(jsonPath("$[0].opponentHandle").value("olena_k"))
                .andExpect(jsonPath("$[0].opponentPhotoUrl").value(PHOTO));

        api.playToCompletion(taras, olena, duelId);

        mvc.perform(get("/api/v1/me/duels").headers(api.bearer(taras)))
                .andExpect(jsonPath("$[0].opponentUsername").value(olena.username()))
                .andExpect(jsonPath("$[0].opponentDisplayName").value("Olena K"))
                .andExpect(jsonPath("$[0].opponentHandle").value("olena_k"))
                .andExpect(jsonPath("$[0].opponentPhotoUrl").value(PHOTO));
        mvc.perform(get("/api/v1/friends").headers(api.bearer(taras)))
                .andExpect(jsonPath("$[0].displayName").value("Olena K"))
                .andExpect(jsonPath("$[0].handle").value("olena_k"))
                .andExpect(jsonPath("$[0].photoUrl").value(PHOTO));

        mvc.perform(post("/api/v1/friends/{id}/challenge", taras.id())
                        .headers(api.bearer(olena))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(api.json(Map.of("stake", 0))))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/challenges").headers(api.bearer(taras)))
                .andExpect(jsonPath("$[0].from.displayName").value("Olena K"))
                .andExpect(jsonPath("$[0].from.handle").value("olena_k"))
                .andExpect(jsonPath("$[0].from.photoUrl").value(PHOTO));
    }
}
