package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.session.dto.DuelView;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** The invite flow a Telegram deep link drives: A creates, B accepts, both end up in the same duel. */
class DuelInviteIntegrationTest extends AbstractIntegrationTest {

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

    private String createInvite(ApiDriver.Player creator) throws Exception {
        return (String) api.readBody(api.createInvite(creator)
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.status").value("PENDING"))
                        .andExpect(jsonPath("$.duelId").doesNotExist()))
                .get("inviteId");
    }

    @Test
    void acceptingAnInviteStartsADuelBothPlayersSee() throws Exception {
        var created = api.readBody(api.createInvite(alice).andExpect(status().isCreated()));
        String inviteId = (String) created.get("inviteId");
        assertThat(Instant.parse((String) created.get("expiresAt"))).isAfter(Instant.now());
        api.inviteStatus(alice, inviteId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));

        DuelView bobView = api.duelView(api.acceptInvite(bob, inviteId).andExpect(status().isOk()));

        assertThat(bobView.you()).isEqualTo(bob.id());
        assertThat(bobView.opponent()).isEqualTo(alice.id());
        var polled = api.readBody(api.inviteStatus(alice, inviteId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED")));
        UUID duelId = UUID.fromString((String) polled.get("duelId"));
        assertThat(duelId).isEqualTo(bobView.duelId());

        DuelView aliceView = api.duelView(api.viewDuel(alice, duelId).andExpect(status().isOk()));
        assertThat(aliceView.opponent()).isEqualTo(bob.id());
        assertThat(aliceView.version()).isEqualTo(bobView.version());
        assertThat(aliceView.trumpCard()).isEqualTo(bobView.trumpCard());
    }

    @Test
    void acceptingYourOwnInviteIs400AndLeavesItPending() throws Exception {
        String inviteId = createInvite(alice);

        api.acceptInvite(alice, inviteId).andExpect(status().isBadRequest());

        api.inviteStatus(alice, inviteId).andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void aSecondAcceptIs409() throws Exception {
        String inviteId = createInvite(alice);
        ApiDriver.Player carol = api.register(ApiDriver.uniqueUsername("carol"));
        api.acceptInvite(bob, inviteId).andExpect(status().isOk());

        api.acceptInvite(carol, inviteId).andExpect(status().isConflict());
        api.acceptInvite(bob, inviteId).andExpect(status().isConflict());
    }

    @Test
    void anExpiredOrUnknownInviteIs404() throws Exception {
        String inviteId = createInvite(alice);
        redis.delete("cardwar:invite:" + inviteId);

        api.acceptInvite(bob, inviteId).andExpect(status().isNotFound());
        api.inviteStatus(alice, inviteId).andExpect(status().isNotFound());
        api.acceptInvite(bob, UUID.randomUUID().toString()).andExpect(status().isNotFound());
        api.acceptInvite(bob, "not-a-uuid").andExpect(status().isNotFound());
    }

    @Test
    void anInviteExpiresOnItsOwn() throws Exception {
        String inviteId = createInvite(alice);

        Long ttl = redis.getExpire("cardwar:invite:" + inviteId, TimeUnit.SECONDS);

        assertThat(ttl).isPositive().isLessThanOrEqualTo(15 * 60);
    }

    @Test
    void onlyTheCreatorAndTheAcceptorMayReadAnInvitesStatus() throws Exception {
        String inviteId = createInvite(alice);
        ApiDriver.Player carol = api.register(ApiDriver.uniqueUsername("carol"));

        api.inviteStatus(carol, inviteId).andExpect(status().isForbidden());
        api.acceptInvite(bob, inviteId).andExpect(status().isOk());
        api.inviteStatus(bob, inviteId).andExpect(status().isOk());
        api.inviteStatus(carol, inviteId).andExpect(status().isForbidden());
    }

    @Test
    void invitesRequireAuthentication() throws Exception {
        mvc.perform(post("/api/v1/duels/invites")).andExpect(status().isUnauthorized());
    }
}
