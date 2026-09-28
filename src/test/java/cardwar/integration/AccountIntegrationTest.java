package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.account.domain.Player;
import cardwar.account.repository.PlayerRepository;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** Registration and login through the real filter chain, plus what ends up in the database afterwards. */
class AccountIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    PlayerRepository players;

    @Autowired
    PasswordEncoder passwordEncoder;

    ApiDriver api;

    @BeforeEach
    void setUp() {
        api = new ApiDriver(mvc, mapper);
    }

    @Test
    void registrationReturnsIdentityAndTokenButNeverThePassword() throws Exception {
        String username = ApiDriver.uniqueUsername("reg");

        var result = api.registerRaw(Map.of("username", username, "password", ApiDriver.PASSWORD))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.playerId").isString())
                .andExpect(jsonPath("$.username").value(username))
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.expiresAt").isString())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        assertThat(result.andReturn().getResponse().getContentAsString()).doesNotContain(ApiDriver.PASSWORD);
    }

    @Test
    void passwordIsStoredOnlyAsABcryptHash() throws Exception {
        ApiDriver.Player registered = api.register(ApiDriver.uniqueUsername("hash"));

        Player stored = players.findById(registered.id()).orElseThrow();
        assertThat(stored.getPasswordHash()).startsWith("$2").isNotEqualTo(ApiDriver.PASSWORD);
        assertThat(passwordEncoder.matches(ApiDriver.PASSWORD, stored.getPasswordHash()))
                .isTrue();
    }

    @Test
    void duplicateUsernameIsA409AndCreatesNoSecondRow() throws Exception {
        String username = ApiDriver.uniqueUsername("dup");
        api.register(username);

        api.registerRaw(Map.of("username", username, "password", ApiDriver.PASSWORD))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));

        assertThat(players.findAll().stream().filter(p -> p.getUsername().equals(username)))
                .hasSize(1);
    }

    @Test
    void invalidRegistrationNamesTheOffendingFields() throws Exception {
        api.registerRaw(Map.of("username", "x!", "password", "short"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors.username").isString())
                .andExpect(jsonPath("$.errors.password").isString());
    }

    @Test
    void loginWithCorrectCredentialsIssuesAUsableToken() throws Exception {
        ApiDriver.Player registered = api.register(ApiDriver.uniqueUsername("login"));

        var body = api.readBody(api.login(registered.username(), ApiDriver.PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.expiresAt").isString()));

        var loggedIn = new ApiDriver.Player(registered.id(), registered.username(), (String) body.get("token"));
        api.me(loggedIn)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.player.id").value(registered.id().toString()))
                .andExpect(jsonPath("$.progress.duelsPlayed").value(0))
                .andExpect(jsonPath("$.collection.owned").isArray());
    }

    @Test
    void wrongPasswordAndUnknownUsernameAreIndistinguishable401s() throws Exception {
        ApiDriver.Player registered = api.register(ApiDriver.uniqueUsername("wrong"));

        String wrongPassword = api.login(registered.username(), "definitely-not-it")
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String unknownUser = api.login(ApiDriver.uniqueUsername("nobody"), ApiDriver.PASSWORD)
                .andExpect(status().isUnauthorized())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(wrongPassword).isEqualTo(unknownUser);
    }

    @Test
    void profileEndpointRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
    }
}
