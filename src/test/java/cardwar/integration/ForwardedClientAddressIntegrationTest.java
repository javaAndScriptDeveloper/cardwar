package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;

import cardwar.TestcontainersConfiguration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/**
 * In production every request reaches the app from nginx, so the rate limiter must key on the address nginx
 * forwards in {@code X-Forwarded-For}, not on nginx's own. Forwarded headers are resolved by Tomcat's
 * RemoteIpValve, which MockMvc bypasses, so this test talks to a real server on a random port.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@TestPropertySource(
        properties = {"cardwar.security.rate-limit.auth-capacity=2", "cardwar.security.rate-limit.auth-refill-period=1h"
        })
class ForwardedClientAddressIntegrationTest {

    private static final String FIRST_CLIENT = "203.0.113.10";
    private static final String SECOND_CLIENT = "203.0.113.20";

    @Value("${local.server.port}")
    int port;

    @Autowired
    ObjectMapper mapper;

    @Test
    void authThrottleIsKeyedOnTheForwardedClientAddressNotTheProxy() {
        var client = RestClient.create("http://localhost:" + port);

        assertThat(login(client, FIRST_CLIENT)).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login(client, FIRST_CLIENT)).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login(client, FIRST_CLIENT)).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);

        // A different forwarded client behind the same proxy gets its own bucket, not the exhausted one.
        assertThat(login(client, SECOND_CLIENT)).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private HttpStatusCode login(RestClient client, String forwardedFor) {
        var body = Map.of("username", ApiDriver.uniqueUsername("nobody"), "password", "whatever-long-enough");
        return client.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Forwarded-For", forwardedFor)
                .body(mapper.writeValueAsString(body))
                .exchange((request, response) -> response.getStatusCode(), false);
    }
}
