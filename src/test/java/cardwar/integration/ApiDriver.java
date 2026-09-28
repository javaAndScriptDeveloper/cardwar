package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * Drives the API the way a client would — over HTTP, with a bearer token — so the tests exercise the filter
 * chain and the controllers rather than reaching past them into the services.
 */
final class ApiDriver {

    /** Long enough to satisfy the registration constraint, and obviously not a real secret. */
    static final String PASSWORD = "correct-horse-battery";

    private final MockMvc mvc;
    private final ObjectMapper mapper;

    ApiDriver(MockMvc mvc, ObjectMapper mapper) {
        this.mvc = mvc;
        this.mapper = mapper;
    }

    record Player(UUID id, String username, String token) {}

    Player register(String username) throws Exception {
        var body = mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("username", username, "password", PASSWORD))))
                .andReturn()
                .getResponse()
                .getContentAsString();
        Map<String, Object> parsed = read(body);
        return new Player(UUID.fromString((String) parsed.get("playerId")), (String) parsed.get("username"), (String)
                parsed.get("token"));
    }

    /** A username that is unique per test run, so tests never collide on the unique constraint. */
    static String uniqueUsername(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    ResultActions registerRaw(Map<String, Object> payload) throws Exception {
        return mvc.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(payload)));
    }

    ResultActions login(String username, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", password))));
    }

    ResultActions createDuel(Player caller, String opponentUsername) throws Exception {
        return mvc.perform(post("/api/v1/duels")
                .headers(bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("opponentUsername", opponentUsername))));
    }

    ResultActions viewDuel(Player caller, UUID duelId) throws Exception {
        return mvc.perform(get("/api/v1/duels/{id}", duelId).headers(bearer(caller)));
    }

    ResultActions move(Player caller, UUID duelId, Map<String, Object> payload) throws Exception {
        return mvc.perform(post("/api/v1/duels/{id}/moves", duelId)
                .headers(bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(payload)));
    }

    ResultActions unlockTheme(Player caller, String code) throws Exception {
        return mvc.perform(post("/api/v1/themes/{code}/unlock", code).headers(bearer(caller)));
    }

    ResultActions unlockSkin(Player caller, String code) throws Exception {
        return mvc.perform(post("/api/v1/skins/{code}/unlock", code).headers(bearer(caller)));
    }

    ResultActions collection(Player caller) throws Exception {
        return mvc.perform(get("/api/v1/collection").headers(bearer(caller)));
    }

    ResultActions me(Player caller) throws Exception {
        return mvc.perform(get("/api/v1/me").headers(bearer(caller)));
    }

    static HttpHeaders bearer(Player caller) {
        var headers = new HttpHeaders();
        headers.setBearerAuth(caller.token());
        return headers;
    }

    Map<String, Object> read(String body) {
        return mapper.readValue(body, new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
    }

    Map<String, Object> readBody(ResultActions actions) throws Exception {
        return read(actions.andReturn().getResponse().getContentAsString());
    }

    String json(Object value) {
        return mapper.writeValueAsString(value);
    }
}
