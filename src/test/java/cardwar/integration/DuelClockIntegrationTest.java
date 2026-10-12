package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.session.dto.DuelView;
import cardwar.session.service.DuelService;
import cardwar.session.store.GameStateStore;
import cardwar.wallet.service.WalletService;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * The move clock: each move has 30 seconds; when it runs out the server plays for the player holding the game up,
 * and the third time it forfeits them. Timeouts are driven with an explicit instant, as the scheduler would.
 */
class DuelClockIntegrationTest extends AbstractIntegrationTest {

    private static final Duration PAST_DEADLINE = Duration.ofSeconds(31);

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DuelService duels;

    @Autowired
    GameStateStore store;

    @Autowired
    WalletService wallets;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
    }

    private UUID startDuel(long stake) throws Exception {
        String inviteId = (String) api.readBody(mvc.perform(post("/api/v1/duels/invites")
                                .headers(api.bearer(alice))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(api.json(Map.of("stake", stake))))
                        .andExpect(status().isCreated()))
                .get("inviteId");
        return api.duelView(api.acceptInvite(bob, inviteId)).duelId();
    }

    private DuelView viewOf(ApiDriver.Player player, UUID duelId) throws Exception {
        return api.duelView(api.viewDuel(player, duelId));
    }

    private ApiDriver.Player attackerOf(DuelView view) {
        return view.attacker().equals(alice.id()) ? alice : bob;
    }

    private ApiDriver.Player defenderOf(DuelView view) {
        return view.attacker().equals(alice.id()) ? bob : alice;
    }

    @Test
    void aNewDuelRunsTheAttackersClock() throws Exception {
        UUID duelId = startDuel(0);

        DuelView view = viewOf(alice, duelId);

        assertThat(view.toMove()).isEqualTo(view.attacker());
        assertThat(view.deadline())
                .isBetween(Instant.now().plusSeconds(25), Instant.now().plusSeconds(31));
        assertThat(view.strikes().you()).isZero();
        assertThat(view.strikes().opponent()).isZero();
    }

    @Test
    void anExpiredClockPlaysForTheAttackerAndCountsAStrike() throws Exception {
        UUID duelId = startDuel(0);
        DuelView before = viewOf(alice, duelId);
        var attacker = attackerOf(before);

        boolean applied = duels.applyTimeout(duelId, before.deadline().plus(Duration.ofMillis(1)));

        assertThat(applied).isTrue();
        DuelView after = viewOf(attacker, duelId);
        assertThat(after.table()).hasSize(1);
        assertThat(after.toMove()).isEqualTo(defenderOf(before).id());
        assertThat(after.strikes().you()).isEqualTo(1);
        assertThat(after.version()).isEqualTo(before.version() + 1);
    }

    @Test
    void nothingHappensBeforeTheDeadline() throws Exception {
        UUID duelId = startDuel(0);
        DuelView before = viewOf(alice, duelId);

        assertThat(duels.applyTimeout(duelId, before.deadline().minusSeconds(1)))
                .isFalse();
        assertThat(viewOf(alice, duelId).version()).isEqualTo(before.version());
    }

    @Test
    void aRealMoveMovesTheDeadlineSoAStaleTimeoutDoesNothing() throws Exception {
        UUID duelId = startDuel(0);
        DuelView before = viewOf(alice, duelId);
        var attacker = attackerOf(before);
        DuelView own = viewOf(attacker, duelId);
        api.move(
                        attacker,
                        duelId,
                        Map.of(
                                "type",
                                "ATTACK",
                                "card",
                                Map.of(
                                        "rank",
                                        own.hand().get(0).rank().name(),
                                        "suit",
                                        own.hand().get(0).suit().name())))
                .andExpect(status().isOk());

        // The old deadline has passed, but the clock now belongs to the defender with a fresh 30 seconds.
        assertThat(duels.applyTimeout(duelId, before.deadline().plusMillis(1))).isFalse();
    }

    @Test
    void theDefenderTakesWhenTheirClockRunsOut() throws Exception {
        UUID duelId = startDuel(0);
        DuelView start = viewOf(alice, duelId);
        duels.applyTimeout(duelId, start.deadline().plusMillis(1));
        DuelView attacked = viewOf(alice, duelId);
        var defender = defenderOf(start);

        duels.applyTimeout(duelId, attacked.deadline().plusMillis(1));

        DuelView after = viewOf(defender, duelId);
        assertThat(after.table()).isEmpty();
        assertThat(after.hand()).hasSize(7);
        assertThat(after.strikes().you()).isEqualTo(1);
    }

    @Test
    void theThirdStrikeForfeitsAndThePotGoesToTheOpponent() throws Exception {
        UUID duelId = startDuel(100);
        DuelView start = viewOf(alice, duelId);
        var attacker = attackerOf(start);
        var defender = defenderOf(start);
        Instant now = Instant.now();

        // The attacker never moves: auto-attack, the defender takes, the attacker is to move again, three times.
        int strikes = 0;
        for (int round = 0; round < 10 && strikes < 3; round++) {
            DuelView view = viewOf(alice, duelId);
            if (view.phase().name().equals("FINISHED")) {
                break;
            }
            now = view.deadline().plus(PAST_DEADLINE);
            boolean attackersTurn = view.toMove().equals(attacker.id());
            duels.applyTimeout(duelId, now);
            if (attackersTurn) {
                strikes++;
            }
        }

        api.viewDuel(alice, duelId).andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/me/duels")
                        .headers(api.bearer(attacker)))
                .andExpect(jsonPath("$[0].result").value("LOST"))
                .andExpect(jsonPath("$[0].endReason").value("FORFEIT"));
        assertThat(wallets.balance(attacker.id())).isEqualTo(400);
        assertThat(wallets.balance(defender.id())).isEqualTo(600);
    }

    @Test
    void aFinishedDuelLeavesTheDeadlineIndex() throws Exception {
        UUID duelId = startDuel(0);
        assertThat(store.dueDeadlines(Instant.now().plus(Duration.ofHours(1)))).contains(duelId);

        api.playToCompletion(alice, bob, duelId);

        assertThat(store.dueDeadlines(Instant.now().plus(Duration.ofHours(1)))).doesNotContain(duelId);
    }
}
