package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

/**
 * What Grafana Alloy scrapes and how a request is followed through the logs. The metrics endpoint is open to the
 * compose network (Alloy has no token); nginx refuses it from outside, which the smoke test checks.
 */
class ObservabilityIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Test
    void prometheusEndpointServesHttpAndJvmMetricsWithoutAToken() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());

        String body = mvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(body).contains("jvm_memory_used_bytes").contains("http_server_requests_seconds");
        assertThat(body).contains("application=\"cardwar\"");
    }

    @Test
    void theRestOfActuatorStaysProtected() throws Exception {
        mvc.perform(get("/actuator/metrics")).andExpect(status().isUnauthorized());
    }

    @Test
    void aWellFormedRequestIdIsEchoed() throws Exception {
        mvc.perform(get("/actuator/health").header("X-Request-Id", "abc12345-from-nginx"))
                .andExpect(header().string("X-Request-Id", "abc12345-from-nginx"));
    }

    @Test
    void aMissingRequestIdIsGenerated() throws Exception {
        String id =
                mvc.perform(get("/actuator/health")).andReturn().getResponse().getHeader("X-Request-Id");

        assertThat(id).matches("[0-9a-f-]{36}");
    }

    @Test
    void aMalformedRequestIdIsReplacedSoItCannotForgeLogLines() throws Exception {
        String id = mvc.perform(get("/actuator/health").header("X-Request-Id", "x\",\"level\":\"ERROR"))
                .andReturn()
                .getResponse()
                .getHeader("X-Request-Id");

        assertThat(id).matches("[0-9a-f-]{36}");
    }
}
