package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.engine.DuelId;
import cardwar.engine.DurakEngine;
import cardwar.engine.GameCommand;
import cardwar.engine.PlayerId;
import cardwar.session.service.DuelCompletionService;
import cardwar.session.service.StakeSweepService;
import cardwar.session.store.GameStateStore;
import cardwar.session.store.StoredDuel;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.WalletService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/** Duels played for coins: the stake is checked, escrowed from both, and paid to the winner or refunded. */
class StakeIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    WalletService wallets;

    @Autowired
    StakeSweepService sweep;

    @Autowired
    GameStateStore store;

    @Autowired
    DuelCompletionService completion;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
    }

    private ResultActions invite(ApiDriver.Player creator, long stake) throws Exception {
        return mvc.perform(post("/api/v1/duels/invites")
                .headers(api.bearer(creator))
                .contentType(MediaType.APPLICATION_JSON)
                .content(api.json(Map.of("stake", stake))));
    }

    private String inviteId(ResultActions created) throws Exception {
        return (String) api.readBody(created.andExpect(status().isCreated())).get("inviteId");
    }

    @Test
    void aStakedDuelPaysThePotToTheWinner() throws Exception {
        String inviteId =
                inviteId(invite(alice, 100).andExpect(jsonPath("$.stake").value(100)));

        var bobView = api.duelView(
                api.acceptInvite(bob, inviteId).andExpect(jsonPath("$.stake").value(100)));
        assertThat(wallets.balance(alice.id())).isEqualTo(400);
        assertThat(wallets.balance(bob.id())).isEqualTo(400);
        api.activeDuels(alice).andExpect(jsonPath("$[0].stake").value(100));

        var finished = api.playToCompletion(alice, bob, bobView.duelId());

        long aliceBalance = wallets.balance(alice.id());
        long bobBalance = wallets.balance(bob.id());
        if (finished.outcome().draw()) {
            assertThat(List.of(aliceBalance, bobBalance)).containsExactly(500L, 500L);
        } else {
            boolean aliceWon = finished.outcome().winner().equals(alice.id());
            assertThat(aliceBalance).isEqualTo(aliceWon ? 600 : 400);
            assertThat(bobBalance).isEqualTo(aliceWon ? 400 : 600);
            mvc.perform(get("/api/v1/me/duels").headers(api.bearer(alice)))
                    .andExpect(jsonPath("$[0].stake").value(100))
                    .andExpect(jsonPath("$[0].coinDelta").value(aliceWon ? 100 : -100));
        }
        assertThat(wallets.ledgerSum(alice.id())).isEqualTo(aliceBalance);
    }

    @Test
    void aFriendlyDuelMovesNoCoins() throws Exception {
        String inviteId =
                inviteId(invite(alice, 0).andExpect(jsonPath("$.stake").value(0)));
        api.acceptInvite(bob, inviteId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stake").value(0));

        assertThat(wallets.balance(alice.id())).isEqualTo(500);
        assertThat(wallets.balance(bob.id())).isEqualTo(500);
    }

    @Test
    void onlyTheTableStakesAreAllowed() throws Exception {
        invite(alice, 123)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INVALID_STAKE"));
        invite(alice, -100)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INVALID_STAKE"));
    }

    @Test
    void theCreatorMustAffordTheStake() throws Exception {
        invite(alice, 1000)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INSUFFICIENT_COINS"));
    }

    @Test
    void anAcceptorWhoCannotPayIsRefusedAndNobodyIsCharged() throws Exception {
        String inviteId = inviteId(invite(alice, 500));
        wallets.debit(bob.id(), 450, CoinKind.PURCHASE, "spent-elsewhere");

        api.acceptInvite(bob, inviteId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INSUFFICIENT_COINS"));

        assertThat(wallets.balance(alice.id())).isEqualTo(500);
        assertThat(wallets.balance(bob.id())).isEqualTo(50);
        api.inviteStatus(alice, inviteId).andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void aSecondAcceptChargesNobody() throws Exception {
        String inviteId = inviteId(invite(alice, 100));
        var carol = api.register(ApiDriver.uniqueUsername("carol"));
        api.acceptInvite(bob, inviteId).andExpect(status().isOk());

        api.acceptInvite(carol, inviteId).andExpect(status().isConflict());

        assertThat(wallets.balance(alice.id())).isEqualTo(400);
        assertThat(wallets.balance(carol.id())).isEqualTo(500);
    }

    @Test
    void creatingAgainWithAnotherStakeReplacesThePendingInvite() throws Exception {
        String first = inviteId(invite(alice, 100));
        String second =
                inviteId(invite(alice, 500).andExpect(jsonPath("$.stake").value(500)));

        assertThat(second).isNotEqualTo(first);
        api.acceptInvite(bob, first).andExpect(status().isNotFound());
    }

    @Test
    void aDrawRefundsBothAndSettlingTwicePaysNothingMore() {
        String duel = UUID.randomUUID().toString();
        wallets.escrow(duel, 100, alice.id(), bob.id());

        wallets.settle(duel, null);
        wallets.settle(duel, null);

        assertThat(wallets.balance(alice.id())).isEqualTo(500);
        assertThat(wallets.balance(bob.id())).isEqualTo(500);
    }

    @Test
    void stakesOfADuelNobodyFinishedAreRefundedOnceBySweep() {
        String vanished = UUID.randomUUID().toString();
        wallets.escrow(vanished, 100, alice.id(), bob.id());

        sweep.sweep(Instant.now().plusSeconds(24 * 3600));
        sweep.sweep(Instant.now().plusSeconds(24 * 3600));

        assertThat(wallets.balance(alice.id())).isEqualTo(500);
        assertThat(wallets.balance(bob.id())).isEqualTo(500);
    }

    @Test
    void theSweepLeavesALiveDuelAlone() throws Exception {
        String inviteId = inviteId(invite(alice, 100));
        api.acceptInvite(bob, inviteId).andExpect(status().isOk());

        sweep.sweep(Instant.now().plusSeconds(24 * 3600));

        assertThat(wallets.balance(alice.id())).isEqualTo(400);
    }

    @Test
    void aSettledDuelCannotAlsoBeRefundedAndARefundedOneCannotAlsoPay() {
        String paid = UUID.randomUUID().toString();
        wallets.escrow(paid, 100, alice.id(), bob.id());
        wallets.settle(paid, alice.id());
        wallets.refund(paid);
        assertThat(wallets.balance(alice.id())).isEqualTo(600);
        assertThat(wallets.balance(bob.id())).isEqualTo(400);

        String refunded = UUID.randomUUID().toString();
        wallets.escrow(refunded, 100, alice.id(), bob.id());
        wallets.refund(refunded);
        wallets.settle(refunded, bob.id());
        assertThat(wallets.balance(alice.id())).isEqualTo(600);
        assertThat(wallets.balance(bob.id())).isEqualTo(400);
    }

    @Test
    void aStakedWinOnAStreakPaysABonusFromTheHouseOnceEvenIfCompletionRunsTwice() throws Exception {
        var duels = new FinishedDuels(completion, wallets);
        // The first win starts the streak; nothing is on it yet, so the pot is all it pays.
        duels.won(alice, bob, 100);
        assertThat(wallets.balance(alice.id())).isEqualTo(600);

        StoredDuel second = duels.decided(alice, bob, 100);
        completion.complete(second, Instant.now());
        completion.complete(second, Instant.now());

        // Pot 200 plus 10% of the stake for a streak of one before this win.
        assertThat(wallets.balance(alice.id())).isEqualTo(710);
        assertThat(wallets.balance(bob.id())).isEqualTo(300);
        assertThat(wallets.transactions(alice.id()).stream()
                        .filter(row -> row.kind() == CoinKind.STREAK_BONUS)
                        .count())
                .isEqualTo(1);
        assertThat(wallets.ledgerSum(alice.id())).isEqualTo(710);
        String duelId = second.state().duelId().value().toString();
        mvc.perform(get("/api/v1/me/duels").headers(api.bearer(alice)))
                .andExpect(jsonPath("$[0].duelId").value(duelId))
                .andExpect(jsonPath("$[0].coinDelta").value(110));

        // Two wins before this one: 20%.
        duels.won(alice, bob, 100);
        assertThat(wallets.balance(alice.id())).isEqualTo(830);
    }

    @Test
    void aDrawOnAStreakPaysNoBonusAndSettleWithoutAStreakPaysThePotOnly() {
        var duels = new FinishedDuels(completion, wallets);
        duels.won(alice, bob, 100);

        duels.drawn(alice, bob, 100);

        assertThat(wallets.balance(alice.id())).isEqualTo(600);
        assertThat(wallets.balance(bob.id())).isEqualTo(400);
        assertThat(wallets.transactions(alice.id()).stream().noneMatch(row -> row.kind() == CoinKind.STREAK_BONUS))
                .isTrue();

        String duel = UUID.randomUUID().toString();
        wallets.escrow(duel, 100, alice.id(), bob.id());
        wallets.settle(duel, alice.id());
        assertThat(wallets.balance(alice.id())).isEqualTo(700);
        assertThat(WalletService.streakBonus(100, 0)).isZero();
        assertThat(WalletService.streakBonus(100, 3)).isEqualTo(30);
        assertThat(WalletService.streakBonus(500, 9)).isEqualTo(250);
    }

    @Test
    void theSweepCompletesAFinishedDuelWhoseCompletionFailedInsteadOfRefundingIt() throws Exception {
        String inviteId = inviteId(invite(alice, 100));
        UUID duelId = api.duelView(api.acceptInvite(bob, inviteId)).duelId();
        // A finished state left in Redis, as if completion had crashed after the final move.
        var stored = store.find(new DuelId(duelId)).orElseThrow();
        var resigned = new DurakEngine().apply(stored.state(), new PlayerId(bob.id()), new GameCommand.Resign());
        store.save(
                stored.with(resigned.state()).withDeadline(null), stored.state().version());

        sweep.sweep(Instant.now().plusSeconds(24 * 3600));

        assertThat(wallets.balance(alice.id())).isEqualTo(600);
        assertThat(wallets.balance(bob.id())).isEqualTo(400);
        assertThat(store.find(new DuelId(duelId))).isEmpty();
        mvc.perform(get("/api/v1/me/duels").headers(api.bearer(alice)))
                .andExpect(jsonPath("$[0].endReason").value("FORFEIT"));
    }
}
