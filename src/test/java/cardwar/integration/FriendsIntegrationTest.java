package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/** Friends are the people you played; a challenge is an invite only they can accept or decline. */
class FriendsIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;
    ApiDriver.Player carol;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
        carol = api.register(ApiDriver.uniqueUsername("carol"));
    }

    private void playOnce(ApiDriver.Player one, ApiDriver.Player two) throws Exception {
        String inviteId = (String) api.readBody(api.createInvite(one)).get("inviteId");
        UUID duelId = api.duelView(api.acceptInvite(two, inviteId)).duelId();
        api.playToCompletion(one, two, duelId);
    }

    private ResultActions challenge(ApiDriver.Player from, ApiDriver.Player to, long stake) throws Exception {
        return mvc.perform(post("/api/v1/friends/{id}/challenge", to.id())
                .headers(api.bearer(from))
                .contentType(MediaType.APPLICATION_JSON)
                .content(api.json(Map.of("stake", stake))));
    }

    @Test
    void anOpponentBecomesAFriendWithTheRecordBetweenYou() throws Exception {
        mvc.perform(get("/api/v1/friends").headers(api.bearer(alice)))
                .andExpect(jsonPath("$").isEmpty());

        playOnce(alice, bob);
        playOnce(bob, alice);

        mvc.perform(get("/api/v1/friends").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].playerId").value(bob.id().toString()))
                .andExpect(jsonPath("$[0].username").value(bob.username()))
                .andExpect(jsonPath("$[0].played").value(2))
                .andExpect(jsonPath("$[0].lastPlayedAt").exists());
    }

    @Test
    void aChallengeReachesOnlyTheFriendWhoCanAcceptOrDecline() throws Exception {
        playOnce(alice, bob);

        String inviteId = (String) api.readBody(challenge(alice, bob, 100)
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.invitee").value(bob.id().toString()))
                        .andExpect(jsonPath("$.stake").value(100)))
                .get("inviteId");

        mvc.perform(get("/api/v1/challenges").headers(api.bearer(bob)))
                .andExpect(jsonPath("$[0].inviteId").value(inviteId))
                .andExpect(jsonPath("$[0].from.playerId").value(alice.id().toString()))
                .andExpect(jsonPath("$[0].stake").value(100));
        mvc.perform(get("/api/v1/challenges").headers(api.bearer(carol)))
                .andExpect(jsonPath("$").isEmpty());
        api.acceptInvite(carol, inviteId).andExpect(status().isForbidden());

        api.acceptInvite(bob, inviteId).andExpect(status().isOk());
        mvc.perform(get("/api/v1/challenges").headers(api.bearer(bob)))
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void aDeclinedChallengeTellsTheChallenger() throws Exception {
        playOnce(alice, bob);
        String inviteId = (String) api.readBody(challenge(alice, bob, 0)).get("inviteId");

        mvc.perform(post("/api/v1/duels/invites/{id}/decline", inviteId).headers(api.bearer(carol)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/duels/invites/{id}/decline", inviteId).headers(api.bearer(bob)))
                .andExpect(status().isNoContent());

        api.inviteStatus(alice, inviteId).andExpect(jsonPath("$.status").value("DECLINED"));
        mvc.perform(get("/api/v1/challenges").headers(api.bearer(bob)))
                .andExpect(jsonPath("$").isEmpty());
        api.acceptInvite(bob, inviteId).andExpect(status().isConflict());
    }

    @Test
    void onlyFriendsCanBeChallenged() throws Exception {
        challenge(alice, carol, 0)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("NOT_A_FRIEND"));
    }
}
