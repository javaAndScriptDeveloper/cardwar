package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.session.domain.DuelResult;
import cardwar.session.repository.DuelResultRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * The player's own duel record, read through the API. Results are seeded straight into Postgres because a
 * finished duel is the only thing the endpoint cares about and playing one to the end here would test the
 * engine, not the history.
 */
class DuelHistoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DuelResultRepository results;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;
    UUID wonDuel;
    UUID drawnDuel;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        wonDuel = UUID.randomUUID();
        drawnDuel = UUID.randomUUID();
        results.save(new DuelResult(
                UUID.randomUUID(),
                wonDuel,
                alice.id(),
                bob.id(),
                alice.id(),
                bob.id(),
                false,
                "OPPONENT_OUT_OF_CARDS",
                now.minus(2, ChronoUnit.HOURS),
                now.minus(1, ChronoUnit.HOURS),
                12));
        results.save(new DuelResult(
                UUID.randomUUID(),
                drawnDuel,
                bob.id(),
                alice.id(),
                null,
                null,
                true,
                "DRAW",
                now.minusSeconds(60),
                now,
                7));
    }

    @Test
    void winnerSeesNewestFirstWithResultsFromHerPointOfView() throws Exception {
        history(alice)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].duelId").value(drawnDuel.toString()))
                .andExpect(jsonPath("$[0].opponentId").value(bob.id().toString()))
                .andExpect(jsonPath("$[0].opponentUsername").value(bob.username()))
                .andExpect(jsonPath("$[0].result").value("DRAW"))
                .andExpect(jsonPath("$[0].endReason").value("DRAW"))
                .andExpect(jsonPath("$[0].moveCount").value(7))
                .andExpect(jsonPath("$[0].startedAt").isString())
                .andExpect(jsonPath("$[0].finishedAt").isString())
                .andExpect(jsonPath("$[1].duelId").value(wonDuel.toString()))
                .andExpect(jsonPath("$[1].opponentUsername").value(bob.username()))
                .andExpect(jsonPath("$[1].result").value("WON"))
                .andExpect(jsonPath("$[1].endReason").value("OPPONENT_OUT_OF_CARDS"))
                .andExpect(jsonPath("$[1].moveCount").value(12));
    }

    @Test
    void loserSeesTheSameDuelsAsLost() throws Exception {
        history(bob)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].result").value("DRAW"))
                .andExpect(jsonPath("$[0].opponentUsername").value(alice.username()))
                .andExpect(jsonPath("$[1].result").value("LOST"))
                .andExpect(jsonPath("$[1].opponentId").value(alice.id().toString()));
    }

    @Test
    void playerWithoutDuelsGetsAnEmptyArray() throws Exception {
        ApiDriver.Player carol = api.register(ApiDriver.uniqueUsername("carol"));

        history(carol)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void historyRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/me/duels")).andExpect(status().isUnauthorized());
    }

    private ResultActions history(ApiDriver.Player caller) throws Exception {
        return mvc.perform(get("/api/v1/me/duels").headers(ApiDriver.bearer(caller)));
    }
}
