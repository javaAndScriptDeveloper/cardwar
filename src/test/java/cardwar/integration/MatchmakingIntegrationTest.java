package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.engine.PlayerId;
import cardwar.session.dto.MatchView;
import cardwar.session.service.MatchmakingService;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.WalletService;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * Quick match: a queue per stake table. Stakes are unusual per test (shared database) so tests never pair with each
 * other's leftovers: each test uses its own pair of players and checks only what they see.
 */
class MatchmakingIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    WalletService wallets;

    @Autowired
    MatchmakingService matchmaking;

    @Autowired
    JdbcTemplate jdbc;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        // Nobody else may be waiting at any table, or these players would pair with a stranger.
        jdbc.update("DELETE FROM matchmaking_entry");
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
    }

    private ResultActions enter(ApiDriver.Player player, long stake) throws Exception {
        return mvc.perform(post("/api/v1/matchmaking")
                .headers(api.bearer(player))
                .contentType(MediaType.APPLICATION_JSON)
                .content(api.json(Map.of("stake", stake))));
    }

    private ResultActions statusOf(ApiDriver.Player player) throws Exception {
        return mvc.perform(get("/api/v1/matchmaking").headers(api.bearer(player)));
    }

    @Test
    void twoPlayersAtTheSameTableArePairedAndBothStakesAreTaken() throws Exception {
        enter(alice, 100)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("WAITING"));

        var bobMatch = api.readBody(enter(bob, 100)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("MATCHED"))
                .andExpect(jsonPath("$.stake").value(100)));
        String duelId = (String) bobMatch.get("duelId");

        statusOf(alice)
                .andExpect(jsonPath("$.status").value("MATCHED"))
                .andExpect(jsonPath("$.duelId").value(duelId));
        assertThat(wallets.balance(alice.id())).isEqualTo(400);
        assertThat(wallets.balance(bob.id())).isEqualTo(400);
        api.activeDuels(alice).andExpect(jsonPath("$[0].duelId").value(duelId));
        // Read once, the match is consumed; the active duel is how the app finds it again.
        statusOf(alice).andExpect(status().isNoContent());
    }

    @Test
    void differentTablesDoNotPair() throws Exception {
        enter(alice, 100).andExpect(jsonPath("$.status").value("WAITING"));
        enter(bob, 500).andExpect(jsonPath("$.status").value("WAITING"));
    }

    @Test
    void leavingTheQueueIsFinal() throws Exception {
        enter(alice, 0).andExpect(jsonPath("$.status").value("WAITING"));

        mvc.perform(delete("/api/v1/matchmaking").headers(api.bearer(alice))).andExpect(status().isNoContent());

        statusOf(alice).andExpect(status().isNoContent());
        enter(bob, 0).andExpect(jsonPath("$.status").value("WAITING"));
    }

    @Test
    void aWaitingPlayerWhoCanNoLongerPayIsSkippedAndDropped() throws Exception {
        enter(alice, 500).andExpect(jsonPath("$.status").value("WAITING"));
        wallets.debit(alice.id(), 450, CoinKind.PURCHASE, "spent-while-waiting");

        enter(bob, 500).andExpect(jsonPath("$.status").value("WAITING"));

        statusOf(alice).andExpect(status().isNoContent());
        assertThat(wallets.balance(bob.id())).isEqualTo(500);
    }

    @Test
    void aStaleEntryExpiresInsteadOfPairing() throws Exception {
        enter(alice, 0).andExpect(jsonPath("$.status").value("WAITING"));
        jdbc.update("UPDATE matchmaking_entry SET created_at = created_at - interval '5 minutes'");

        enter(bob, 0).andExpect(jsonPath("$.status").value("WAITING"));

        statusOf(alice).andExpect(jsonPath("$.status").value("EXPIRED"));
        statusOf(alice).andExpect(status().isNoContent());
    }

    @Test
    void stakeRulesMatchTheInvites() throws Exception {
        enter(alice, 7)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INVALID_STAKE"));
        enter(alice, 1000)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INSUFFICIENT_COINS"));
    }

    @Test
    void twoPlayersEnteringAtOnceAreStillPaired() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<MatchView>> both = List.of(
                    () -> matchmaking.enter(new PlayerId(alice.id()), 0),
                    () -> matchmaking.enter(new PlayerId(bob.id()), 0));
            var results = pool.invokeAll(both);
            long matched = 0;
            for (var result : results) {
                if (result.get().status() == MatchView.Status.MATCHED) {
                    matched++;
                }
            }
            assertThat(matched).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
