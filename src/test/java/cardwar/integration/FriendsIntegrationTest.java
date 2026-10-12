package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.account.service.AccountService;
import cardwar.session.service.DuelCompletionService;
import cardwar.wallet.service.WalletService;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
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

    @Autowired
    StringRedisTemplate redis;

    @Autowired
    DuelCompletionService completion;

    @Autowired
    WalletService wallets;

    @Autowired
    AccountService accounts;

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

    @Test
    void theLeaderboardRanksYourFriendsAndYouByCoinsWonThisWeek() throws Exception {
        var duels = new FinishedDuels(completion, wallets);
        var dave = api.register(ApiDriver.uniqueUsername("dave"));
        for (var player : java.util.List.of(alice, bob, carol, dave)) {
            accounts.creditCurrency(player.id(), 5000);
        }

        // Nobody played yet: the board is just you, with nothing on it.
        mvc.perform(get("/api/v1/friends/leaderboard").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].playerId").value(alice.id().toString()))
                .andExpect(jsonPath("$[0].player.username").value(alice.username()))
                .andExpect(jsonPath("$[0].you").value(true))
                .andExpect(jsonPath("$[0].wins").value(0))
                .andExpect(jsonPath("$[0].coinsWon").value(0));

        duels.won(bob, alice, 100);
        duels.won(carol, alice, 500);
        duels.won(alice, bob, 0);
        duels.won(alice, carol, 0);
        // Dave never played Alice: not on her board however much he wins.
        duels.won(dave, bob, 1000);
        // Last week's win is off the board, but Carol stays a friend because of it.
        duels.won(carol, alice, 500, Instant.now().minus(Duration.ofDays(8)));

        mvc.perform(get("/api/v1/friends/leaderboard").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].playerId").value(carol.id().toString()))
                .andExpect(jsonPath("$[0].player.displayName").exists())
                .andExpect(jsonPath("$[0].wins").value(1))
                .andExpect(jsonPath("$[0].coinsWon").value(500))
                .andExpect(jsonPath("$[0].you").value(false))
                .andExpect(jsonPath("$[1].playerId").value(bob.id().toString()))
                .andExpect(jsonPath("$[1].coinsWon").value(100))
                .andExpect(jsonPath("$[2].playerId").value(alice.id().toString()))
                .andExpect(jsonPath("$[2].wins").value(2))
                .andExpect(jsonPath("$[2].coinsWon").value(0))
                .andExpect(jsonPath("$[2].you").value(true));

        // Bob's board has Dave and Alice around him, and not Carol.
        mvc.perform(get("/api/v1/friends/leaderboard").headers(api.bearer(bob)))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].playerId").value(dave.id().toString()))
                .andExpect(jsonPath("$[0].coinsWon").value(1000))
                .andExpect(jsonPath("$[1].playerId").value(bob.id().toString()))
                .andExpect(jsonPath("$[1].you").value(true))
                .andExpect(jsonPath("$[2].playerId").value(alice.id().toString()));
    }

    @Test
    void theChallengerSeesTheirChallengesWithHowEachEnded() throws Exception {
        playOnce(alice, bob);
        playOnce(alice, carol);
        // An open invite by link is nobody's challenge and is not listed.
        api.createInvite(alice).andExpect(status().isCreated());

        String declined = (String) api.readBody(challenge(alice, bob, 0)).get("inviteId");
        mvc.perform(get("/api/v1/challenges/outgoing").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].inviteId").value(declined))
                .andExpect(jsonPath("$[0].to.playerId").value(bob.id().toString()))
                .andExpect(jsonPath("$[0].to.displayName").exists())
                .andExpect(jsonPath("$[0].status").value("WAITING"));
        mvc.perform(post("/api/v1/duels/invites/{id}/decline", declined).headers(api.bearer(bob)))
                .andExpect(status().isNoContent());

        String expired = (String) api.readBody(challenge(alice, carol, 0)).get("inviteId");
        // Redis drops an invite at its TTL; deleting the key is that moment, without waiting for it.
        redis.delete("cardwar:invite:" + expired);

        String accepted = (String) api.readBody(challenge(alice, bob, 100)).get("inviteId");
        api.acceptInvite(bob, accepted).andExpect(status().isOk());

        mvc.perform(get("/api/v1/challenges/outgoing").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].inviteId").value(accepted))
                .andExpect(jsonPath("$[0].status").value("ACCEPTED"))
                .andExpect(jsonPath("$[0].stake").value(100))
                .andExpect(jsonPath("$[1].inviteId").value(expired))
                .andExpect(jsonPath("$[1].to.playerId").value(carol.id().toString()))
                .andExpect(jsonPath("$[1].status").value("EXPIRED"))
                .andExpect(jsonPath("$[2].inviteId").value(declined))
                .andExpect(jsonPath("$[2].status").value("DECLINED"));
        mvc.perform(get("/api/v1/challenges/outgoing").headers(api.bearer(bob)))
                .andExpect(jsonPath("$").isEmpty());
        mvc.perform(get("/api/v1/challenges").headers(api.bearer(bob)))
                .andExpect(jsonPath("$").isEmpty());
    }
}
