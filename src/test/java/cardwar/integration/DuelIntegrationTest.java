package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.engine.Card;
import cardwar.engine.Deck;
import cardwar.engine.DuelPhase;
import cardwar.engine.DurakEngine;
import cardwar.engine.DurakRules;
import cardwar.session.domain.DuelResult;
import cardwar.session.dto.DuelView;
import cardwar.session.repository.DuelResultRepository;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * Two real accounts playing over the public API. The tests know nothing the players would not: each side acts on
 * its own redacted view, exactly as two clients would.
 */
class DuelIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DuelResultRepository results;

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

    // --- creation -----------------------------------------------------------------------------------------

    @Test
    void creatingADuelDealsSixEachAndRevealsTheTrump() throws Exception {
        DuelView view = view(api.createDuel(alice, bob.username())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.handA").doesNotExist())
                .andExpect(jsonPath("$.handB").doesNotExist())
                .andExpect(jsonPath("$.talon").doesNotExist()));

        assertThat(view.you()).isEqualTo(alice.id());
        assertThat(view.opponent()).isEqualTo(bob.id());
        assertThat(view.hand()).hasSize(DurakEngine.HAND_SIZE);
        assertThat(view.opponentHandCount()).isEqualTo(DurakEngine.HAND_SIZE);
        assertThat(view.talonCount()).isEqualTo(Deck.SIZE - 2 * DurakEngine.HAND_SIZE);
        assertThat(view.trumpCard().suit()).isEqualTo(view.trumpSuit());
        assertThat(view.phase()).isEqualTo(DuelPhase.ATTACK);
        assertThat(view.version()).isZero();
    }

    @Test
    void duelAgainstYourselfIs400AndAgainstNobodyIs404() throws Exception {
        api.createDuel(alice, alice.username()).andExpect(status().isBadRequest());
        api.createDuel(alice, ApiDriver.uniqueUsername("ghost")).andExpect(status().isNotFound());
    }

    // --- the full walkthrough (11.2) ------------------------------------------------------------------------

    @Test
    void twoPlayersCanPlayADuelToCompletionAndOnlyTheResultSurvives() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()).andExpect(status().isCreated()));
        UUID duelId = start.duelId();
        String stateKey = "cardwar:duel:" + duelId;
        assertThat(redis.hasKey(stateKey)).isTrue();

        DuelView finished = api.playToCompletion(alice, bob, duelId);

        assertThat(finished.phase()).isEqualTo(DuelPhase.FINISHED);
        assertThat(finished.outcome()).isNotNull();
        assertThat(finished.talonCount()).isZero();

        DuelResult result = results.findByDuelId(duelId).orElseThrow();
        assertThat(Set.of(result.getPlayerA(), result.getPlayerB())).containsExactlyInAnyOrder(alice.id(), bob.id());
        assertThat(result.getMoveCount()).isEqualTo((int) finished.version());
        assertThat(result.getFinishedAt()).isAfterOrEqualTo(result.getStartedAt());
        if (finished.outcome().draw()) {
            assertThat(result.isDraw()).isTrue();
            assertThat(result.getWinnerId()).isNull();
            assertThat(result.getLoserId()).isNull();
        } else {
            assertThat(result.isDraw()).isFalse();
            assertThat(result.getWinnerId()).isEqualTo(finished.outcome().winner());
            assertThat(result.getLoserId()).isEqualTo(finished.outcome().loser());
        }

        // In-progress state is gone: Redis has dropped the key and the API no longer knows the duel.
        assertThat(redis.hasKey(stateKey)).isFalse();
        api.viewDuel(alice, duelId).andExpect(status().isNotFound());

        // Progress: both played once, only the winner won.
        int aliceWon = !finished.outcome().draw()
                        && alice.id().equals(finished.outcome().winner())
                ? 1
                : 0;
        int bobWon =
                !finished.outcome().draw() && bob.id().equals(finished.outcome().winner()) ? 1 : 0;
        api.me(alice)
                .andExpect(jsonPath("$.progress.duelsPlayed").value(1))
                .andExpect(jsonPath("$.progress.duelsWon").value(aliceWon));
        api.me(bob)
                .andExpect(jsonPath("$.progress.duelsPlayed").value(1))
                .andExpect(jsonPath("$.progress.duelsWon").value(bobWon));
    }

    @Test
    void aPlayerCanLeaveADuelAndForfeitsItToTheOpponent() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()).andExpect(status().isCreated()));
        UUID duelId = start.duelId();

        DuelView finished =
                view(api.move(alice, duelId, Map.of("type", "RESIGN")).andExpect(status().isOk()));

        assertThat(finished.phase()).isEqualTo(DuelPhase.FINISHED);
        assertThat(finished.outcome().winner()).isEqualTo(bob.id());
        assertThat(finished.outcome().loser()).isEqualTo(alice.id());
        DuelResult result = results.findByDuelId(duelId).orElseThrow();
        assertThat(result.getEndReason()).isEqualTo("FORFEIT");
        // Finished means gone for both, exactly like a duel played to the end.
        api.viewDuel(bob, duelId).andExpect(status().isNotFound());
    }

    // --- authorization and redaction (11.3) -----------------------------------------------------------------

    @Test
    void aThirdPlayerCannotReadMoveOrSubscribe() throws Exception {
        ApiDriver.Player carol = api.register(ApiDriver.uniqueUsername("carol"));
        DuelView start = view(api.createDuel(alice, bob.username()));
        UUID duelId = start.duelId();

        api.viewDuel(carol, duelId).andExpect(status().isForbidden());
        api.move(carol, duelId, Map.of("type", "END_ATTACK")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/duels/{id}/events", duelId)
                        .headers(ApiDriver.bearer(carol))
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isForbidden());

        assertThat(view(api.viewDuel(alice, duelId)).version()).isEqualTo(start.version());
    }

    @Test
    void aParticipantNeverSeesTheOpponentsCardsInTheRestView() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));

        DuelView aliceView = view(api.viewDuel(alice, start.duelId()));
        DuelView bobView = view(api.viewDuel(bob, start.duelId()));

        assertThat(aliceView.hand()).hasSize(6).doesNotContainAnyElementsOf(bobView.hand());
        assertThat(aliceView.opponentHandCount()).isEqualTo(6);
        assertThat(bobView.opponentHandCount()).isEqualTo(6);
        String rawBobView =
                api.viewDuel(bob, start.duelId()).andReturn().getResponse().getContentAsString();
        for (Card aliceCard : aliceView.hand()) {
            // The trump card is public and may legitimately be in a hand later; at the start it is in the talon.
            assertThat(rawBobView).doesNotContain(cardJson(aliceCard));
        }
    }

    // --- the event stream (11.3 redaction, 11.5 delivery) ---------------------------------------------------

    @Test
    void aMoveByOnePlayerReachesTheOtherPlayersOpenStreamWithoutHandDetail() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));
        UUID duelId = start.duelId();
        ApiDriver.Player attacker = start.attacker().equals(alice.id()) ? alice : bob;
        ApiDriver.Player defender = attacker == alice ? bob : alice;

        MvcResult stream = mvc.perform(get("/api/v1/duels/{id}/events", duelId)
                        .headers(ApiDriver.bearer(defender))
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();

        Card lead = view(api.viewDuel(attacker, duelId)).hand().getFirst();
        api.move(attacker, duelId, Moves.attack(lead)).andExpect(status().isOk());

        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(stream.getResponse().getContentAsString())
                        .contains("\"type\":\"CARD_PLAYED\"")
                        .contains(cardJson(lead)));
        String delivered = stream.getResponse().getContentAsString();
        assertThat(delivered).doesNotContain("\"hand\"").doesNotContain("\"talon\"");
        assertThat(delivered).contains("\"duelId\":\"" + duelId + "\"");
    }

    @Test
    void anIdleStreamStillReceivesAKeepaliveComment() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));

        MvcResult stream = mvc.perform(get("/api/v1/duels/{id}/events", start.duelId())
                        .headers(ApiDriver.bearer(alice))
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted())
                .andReturn();

        // Nobody moves. The test profile shortens the heartbeat to a second so this stays quick.
        await().atMost(Duration.ofSeconds(5))
                .untilAsserted(() ->
                        assertThat(stream.getResponse().getContentAsString()).contains(":keepalive"));
    }

    // --- illegal moves (11.4) -------------------------------------------------------------------------------

    @Test
    void outOfTurnMoveIs400AndLeavesTheStateUnchanged() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));
        ApiDriver.Player defender = start.attacker().equals(alice.id()) ? bob : alice;
        Card anyCard = view(api.viewDuel(defender, start.duelId())).hand().getFirst();

        api.move(defender, start.duelId(), Moves.attack(anyCard))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.reason").value("NOT_YOUR_TURN"));

        assertThat(view(api.viewDuel(defender, start.duelId())).version()).isEqualTo(start.version());
    }

    @Test
    void cardNotInHandIs400AndLeavesTheStateUnchanged() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));
        ApiDriver.Player attacker = start.attacker().equals(alice.id()) ? alice : bob;
        DuelView attackerView = view(api.viewDuel(attacker, start.duelId()));
        Card notHeld = Deck.ordered().stream()
                .filter(card -> !attackerView.hand().contains(card))
                .findFirst()
                .orElseThrow();

        api.move(attacker, start.duelId(), Moves.attack(notHeld))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("CARD_NOT_IN_HAND"));

        assertThat(view(api.viewDuel(attacker, start.duelId())).version()).isEqualTo(start.version());
    }

    @Test
    void unbeatableDefenceIs400AndLeavesTheStateUnchanged() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));
        ApiDriver.Player attacker = start.attacker().equals(alice.id()) ? alice : bob;
        ApiDriver.Player defender = attacker == alice ? bob : alice;
        DuelView attackerView = view(api.viewDuel(attacker, start.duelId()));
        DuelView defenderView = view(api.viewDuel(defender, start.duelId()));

        // Find an attack card and a defender card that does not beat it. With six cards each this always exists
        // unless the defender holds nothing but high trumps, which the test would then report honestly.
        Card attackCard = null;
        Card weakDefence = null;
        for (Card candidate : attackerView.hand()) {
            Optional<Card> loser = defenderView.hand().stream()
                    .filter(card -> !DurakRules.beats(candidate, card, start.trumpSuit()))
                    .findFirst();
            if (loser.isPresent()) {
                attackCard = candidate;
                weakDefence = loser.get();
                break;
            }
        }
        assertThat(attackCard)
                .as("a losing defence should exist for some opening card")
                .isNotNull();

        DuelView afterAttack = view(
                api.move(attacker, start.duelId(), Moves.attack(attackCard)).andExpect(status().isOk()));
        api.move(defender, start.duelId(), Moves.defend(attackCard, weakDefence))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("CANNOT_BEAT"));

        DuelView unchanged = view(api.viewDuel(defender, start.duelId()));
        assertThat(unchanged.version()).isEqualTo(afterAttack.version());
        assertThat(unchanged.table()).hasSize(1);
        assertThat(unchanged.table().getFirst().defence()).isNull();
    }

    @Test
    void malformedMovePayloadIs400BeforeAnyGameLogicRuns() throws Exception {
        DuelView start = view(api.createDuel(alice, bob.username()));

        api.move(alice, start.duelId(), Map.of("type", "TELEPORT")).andExpect(status().isBadRequest());
        api.move(alice, start.duelId(), Map.of("type", "ATTACK")).andExpect(status().isBadRequest());
        api.move(alice, start.duelId(), Map.of("card", Map.of("rank", "SIX", "suit", "CLUBS")))
                .andExpect(status().isBadRequest());

        assertThat(view(api.viewDuel(alice, start.duelId())).version()).isEqualTo(start.version());
    }

    private static String cardJson(Card card) {
        return "{\"rank\":\"" + card.rank().name() + "\",\"suit\":\""
                + card.suit().name() + "\"}";
    }

    private DuelView view(ResultActions actions) throws Exception {
        return mapper.readValue(actions.andReturn().getResponse().getContentAsString(), DuelView.class);
    }
}
