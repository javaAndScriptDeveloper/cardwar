package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * The business counters Grafana's business dashboard reads. The shared test context accumulates counts across
 * tests, so each assertion is on the increase this test caused.
 */
class GameMetricsIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    MeterRegistry registry;

    ApiDriver api;

    @BeforeEach
    void setUp() {
        api = new ApiDriver(mvc, mapper);
    }

    private double count(String name, String... tags) {
        var counter = registry.find(name).tags(tags).counter();
        return counter == null ? 0 : counter.count();
    }

    @Test
    void registrationsAndLoginsAreCountedByMethod() throws Exception {
        double registered = count("cardwar.signins", "method", "register");
        double password = count("cardwar.signins", "method", "password");

        var alice = api.register(ApiDriver.uniqueUsername("alice"));
        api.login(alice.username(), ApiDriver.PASSWORD).andExpect(status().isOk());

        assertThat(count("cardwar.signins", "method", "register")).isEqualTo(registered + 1);
        assertThat(count("cardwar.signins", "method", "password")).isEqualTo(password + 1);
    }

    @Test
    void anInvitedDuelPlayedToTheEndIsCountedFromStartToFinish() throws Exception {
        double created = count("cardwar.invites", "event", "created");
        double accepted = count("cardwar.invites", "event", "accepted");
        double started = count("cardwar.duels.started", "mode", "invite");
        double finished = registry.find("cardwar.duels.finished").counters().stream()
                .mapToDouble(c -> c.count())
                .sum();
        double attacks = count("cardwar.moves", "type", "attack", "outcome", "ok");
        double rejected = count("cardwar.moves", "outcome", "rejected");

        var alice = api.register(ApiDriver.uniqueUsername("alice"));
        var bob = api.register(ApiDriver.uniqueUsername("bob"));
        String inviteId = (String) api.readBody(api.createInvite(alice)).get("inviteId");
        UUID duelId = api.duelView(api.acceptInvite(bob, inviteId)).duelId();
        var view = api.duelView(api.viewDuel(alice, duelId));
        // Whoever is not attacking tries to attack: the engine says no, and that is a rejected move.
        var notAttacker = view.attacker().equals(alice.id()) ? bob : alice;
        api.move(notAttacker, duelId, Map.of("type", "TAKE")).andExpect(status().isBadRequest());
        api.playToCompletion(alice, bob, duelId);

        assertThat(count("cardwar.invites", "event", "created")).isEqualTo(created + 1);
        assertThat(count("cardwar.invites", "event", "accepted")).isEqualTo(accepted + 1);
        assertThat(count("cardwar.duels.started", "mode", "invite")).isEqualTo(started + 1);
        assertThat(registry.find("cardwar.duels.finished").counters().stream()
                        .mapToDouble(c -> c.count())
                        .sum())
                .isEqualTo(finished + 1);
        assertThat(count("cardwar.moves", "type", "attack", "outcome", "ok")).isGreaterThan(attacks);
        assertThat(count("cardwar.moves", "outcome", "rejected")).isEqualTo(rejected + 1);
    }

    @Test
    void openEventStreamsAreAGauge() {
        assertThat(registry.find("cardwar.sse.streams.open").gauge()).isNotNull();
    }
}
