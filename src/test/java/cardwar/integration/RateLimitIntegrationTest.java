package cardwar.integration;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs in its own context with a deliberately tiny authentication bucket, so the throttle can be exhausted in a
 * handful of requests without slowing down every other test that logs in.
 */
@TestPropertySource(
        properties = {
            "cardwar.security.rate-limit.auth-capacity=3",
            "cardwar.security.rate-limit.auth-refill-period=1h",
            "cardwar.security.rate-limit.capacity=1000",
            "cardwar.security.rate-limit.refill-period=1h"
        })
class RateLimitIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Test
    void repeatedLoginAttemptsAreThrottledWith429ButTheGeneralApiIsNot() throws Exception {
        var api = new ApiDriver(mvc, mapper);
        // Registration consumes one auth-bucket token; two failed logins consume the rest.
        ApiDriver.Player player = api.register(ApiDriver.uniqueUsername("flood"));
        api.login(player.username(), "wrong-password-one").andExpect(status().isUnauthorized());
        api.login(player.username(), "wrong-password-two").andExpect(status().isUnauthorized());

        api.login(player.username(), ApiDriver.PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.status").value(429));
        api.registerRaw(Map.of("username", ApiDriver.uniqueUsername("late"), "password", ApiDriver.PASSWORD))
                .andExpect(status().isTooManyRequests());

        // The general bucket is separate and keyed on the principal, so an authenticated call still succeeds.
        api.me(player).andExpect(status().isOk());
    }
}
