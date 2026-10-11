package cardwar.integration;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.session.dto.DuelView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** What a reopened Mini App asks first: which duel was I in? */
class ActiveDuelsIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    StringRedisTemplate redis;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
    }

    @Test
    void bothPlayersListAnActiveDuelWithoutAnyCards() throws Exception {
        DuelView start = api.duelView(api.createDuel(alice, bob.username()));

        api.activeDuels(alice)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].duelId").value(start.duelId().toString()))
                .andExpect(jsonPath("$[0].opponentId").value(bob.id().toString()))
                .andExpect(jsonPath("$[0].opponentUsername").value(bob.username()))
                .andExpect(jsonPath("$[0].attacker").value(start.attacker().toString()))
                .andExpect(jsonPath("$[0].phase").value("ATTACK"))
                .andExpect(jsonPath("$[0].version").value(0))
                .andExpect(jsonPath("$[0].hand").doesNotExist())
                .andExpect(jsonPath("$[0].trumpCard").doesNotExist());
        api.activeDuels(bob)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].opponentUsername").value(alice.username()));
    }

    @Test
    void aFinishedDuelIsListedByNeitherPlayer() throws Exception {
        DuelView start = api.duelView(api.createDuel(alice, bob.username()));

        api.playToCompletion(alice, bob, start.duelId());

        api.activeDuels(alice).andExpect(jsonPath("$.length()").value(0));
        api.activeDuels(bob).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void aNonParticipantNeverSeesTheDuel() throws Exception {
        ApiDriver.Player carol = api.register(ApiDriver.uniqueUsername("carol"));
        api.createDuel(alice, bob.username()).andExpect(status().isCreated());

        api.activeDuels(carol)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void anExpiredDuelDoesNotLinger() throws Exception {
        DuelView start = api.duelView(api.createDuel(alice, bob.username()));
        redis.delete("cardwar:duel:" + start.duelId());

        api.activeDuels(alice).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void activeDuelsRequireAuthentication() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/duels/active"))
                .andExpect(status().isUnauthorized());
    }
}
