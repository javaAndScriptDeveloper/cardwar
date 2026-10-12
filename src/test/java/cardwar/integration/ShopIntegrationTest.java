package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.bot.service.TelegramBotService;
import cardwar.monetization.service.StarsService;
import cardwar.support.MutableClock;
import cardwar.support.StubStreakSource;
import cardwar.wallet.service.WalletService;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/**
 * Coins buy cosmetics; cosmetics are equipped and seen at the table; Stars buy coins. Some items are earned by a
 * win streak instead, and some are on sale one week in four.
 */
class ShopIntegrationTest extends AbstractIntegrationTest {

    /** Saturday of ISO week 12, 2027 (12 % 4 == 0): Kyiv moves to summer time the next morning. */
    private static final Instant SLOT_0_WEEK = Instant.parse("2027-03-27T12:00:00Z");

    /** Monday 2027-03-29 00:00 in Kyiv, already EEST (UTC+3). A naive "+7 days" from the week's start is an hour off. */
    private static final Instant SLOT_0_WEEK_ENDS = Instant.parse("2027-03-28T21:00:00Z");

    /** ISO week 42, 2026 (42 % 4 == 2): no drop on sale. */
    private static final Instant OFF_WEEK = Instant.parse("2026-10-13T10:00:00Z");

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    WalletService wallets;

    @Autowired
    StarsService stars;

    @Autowired
    TelegramBotService bot;

    @Autowired
    MutableClock clock;

    @Autowired
    StubStreakSource streaks;

    @Autowired
    JdbcTemplate jdbc;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
    }

    @AfterEach
    void unpin() {
        clock.reset();
        streaks.reset();
    }

    private ResultActions shop(ApiDriver.Player player) throws Exception {
        return mvc.perform(get("/api/v1/shop").headers(api.bearer(player))).andExpect(status().isOk());
    }

    @Test
    void earnedItemsAreListedWithTheirRequirementAndAreNotForSale() throws Exception {
        shop(alice)
                .andExpect(jsonPath("$.items[?(@.code == 'deck-sluhy-narodu')].price")
                        .value(1500))
                .andExpect(jsonPath("$.items[?(@.code == 'deck-sluhy-narodu')].unlock")
                        .isEmpty())
                .andExpect(jsonPath("$.items[?(@.code == 'deck-blogery')].unlock.kind")
                        .value("WIN_STREAK"))
                .andExpect(jsonPath("$.items[?(@.code == 'deck-blogery')].unlock.value")
                        .value(3))
                .andExpect(jsonPath("$.items[?(@.code == 'deck-blogery')].unlock.met")
                        .value(false))
                .andExpect(
                        jsonPath("$.items[?(@.code == 'deck-blogery')].owned").value(false))
                .andExpect(jsonPath("$.items[?(@.code == 'frame-kozak')].unlock.value")
                        .value(5))
                .andExpect(jsonPath("$.items[?(@.code == 'emote-ty-sho')].name").value("Ти шо, Кличко?"))
                .andExpect(
                        jsonPath("$.items[?(@.code == 'emote-ty-sho')].price").value(200))
                .andExpect(
                        jsonPath("$.items[?(@.code == 'table-blackout')].name").value("Хрещатик при блекауті"));

        buy(alice, "deck-blogery")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("NOT_FOR_SALE"));
        assertThat(wallets.balance(alice.id())).isEqualTo(500);
    }

    @Test
    void aWinStreakGrantsItsItemOnTheNextShopVisitExactlyOnce() throws Exception {
        streaks.set(alice.id(), 3);

        for (int visit = 0; visit < 2; visit++) {
            shop(alice)
                    .andExpect(jsonPath("$.items[?(@.code == 'deck-blogery')].owned")
                            .value(true))
                    .andExpect(jsonPath("$.items[?(@.code == 'deck-blogery')].unlock.met")
                            .value(true))
                    .andExpect(jsonPath("$.items[?(@.code == 'frame-kozak')].owned")
                            .value(false));
        }
        assertThat(jdbc.queryForList(
                        "SELECT source FROM owned_item WHERE player_id = ? AND item_code = ?",
                        String.class,
                        alice.id(),
                        "deck-blogery"))
                .containsExactly("STREAK");
        assertThat(wallets.balance(alice.id())).isEqualTo(500);

        equip(alice, "deck-blogery")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deck").value("blogery"));
        shop(bob)
                .andExpect(
                        jsonPath("$.items[?(@.code == 'deck-blogery')].owned").value(false));
    }

    @Test
    void aDropIsOnSaleOnlyInItsKyivWeekAndSaysWhenTheWeekEnds() throws Exception {
        clock.pin(SLOT_0_WEEK);
        shop(alice)
                .andExpect(jsonPath("$.drops.length()").value(1))
                .andExpect(jsonPath("$.drops[0].code").value("back-bavovna"))
                .andExpect(jsonPath("$.drops[0].availableUntil").value(SLOT_0_WEEK_ENDS.toString()))
                .andExpect(jsonPath("$.items[?(@.code == 'back-bavovna')].unlock.kind")
                        .value("DROP"))
                .andExpect(jsonPath("$.items[?(@.code == 'back-bavovna')].unlock.met")
                        .value(true))
                .andExpect(jsonPath("$.items[?(@.code == 'table-kabmin')].unlock.kind")
                        .value("DROP"))
                .andExpect(jsonPath("$.items[?(@.code == 'table-kabmin')].unlock.value")
                        .value(1))
                .andExpect(jsonPath("$.items[?(@.code == 'table-kabmin')].unlock.met")
                        .value(false))
                .andExpect(jsonPath("$.items[?(@.code == 'table-kabmin')].availableUntil")
                        .isEmpty());
        buy(alice, "table-kabmin")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("NOT_ON_SALE"));
        buy(alice, "back-bavovna")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.owned").value(true));
        assertThat(wallets.balance(alice.id())).isEqualTo(0);

        clock.pin(OFF_WEEK);
        shop(alice)
                .andExpect(jsonPath("$.drops").isEmpty())
                .andExpect(
                        jsonPath("$.items[?(@.code == 'back-bavovna')].owned").value(true))
                .andExpect(jsonPath("$.items[?(@.code == 'back-bavovna')].unlock.met")
                        .value(false))
                .andExpect(jsonPath("$.items[?(@.code == 'back-bavovna')].availableUntil")
                        .isEmpty());
        buy(bob, "back-bavovna")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("NOT_ON_SALE"));
    }

    private ResultActions buy(ApiDriver.Player player, String code) throws Exception {
        return mvc.perform(post("/api/v1/shop/items/{code}/buy", code).headers(api.bearer(player)));
    }

    private ResultActions equip(ApiDriver.Player player, String code) throws Exception {
        return mvc.perform(post("/api/v1/shop/items/{code}/equip", code).headers(api.bearer(player)));
    }

    @Test
    void theShopListsEveryTypeWithFreeDefaultsOwnedAndEquipped() throws Exception {
        mvc.perform(get("/api/v1/shop").headers(api.bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.items[?(@.code == 'deck-classic')].owned").value(true))
                .andExpect(jsonPath("$.items[?(@.code == 'deck-classic')].equipped")
                        .value(true))
                .andExpect(
                        jsonPath("$.items[?(@.code == 'back-trident')].owned").value(false))
                .andExpect(jsonPath("$.items[?(@.type == 'EMOTE')]").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.type == 'FRAME')]").isNotEmpty())
                .andExpect(jsonPath("$.coinPacks[0].stars").value(50));
        mvc.perform(get("/api/v1/me/loadout").headers(api.bearer(alice)))
                .andExpect(jsonPath("$.deck").value("classic"))
                .andExpect(jsonPath("$.cardBack").value("classic"))
                .andExpect(jsonPath("$.table").value("green"))
                .andExpect(jsonPath("$.frame").doesNotExist());
    }

    @Test
    void buyingTakesTheCoinsOnceAndEquippingShowsUpInTheLoadout() throws Exception {
        buy(alice, "back-trident")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.owned").value(true));
        long afterBuy = wallets.balance(alice.id());
        assertThat(afterBuy).isEqualTo(500 - 300);

        buy(alice, "back-trident")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.reason").value("ALREADY_OWNED"));
        assertThat(wallets.balance(alice.id())).isEqualTo(afterBuy);

        equip(alice, "back-trident")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cardBack").value("trident"));
    }

    @Test
    void anItemTooExpensiveIsRefusedAndAnUnownedOneCannotBeEquipped() throws Exception {
        buy(alice, "deck-memes-demo")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("INSUFFICIENT_COINS"));
        equip(alice, "deck-memes-demo")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("NOT_OWNED"));
        buy(alice, "no-such-item").andExpect(status().isNotFound());
    }

    @Test
    void theOpponentSeesYourCardBackAndFrameAndEmotesReachTheTable() throws Exception {
        buy(alice, "back-trident").andExpect(status().isOk());
        equip(alice, "back-trident").andExpect(status().isOk());
        buy(alice, "emote-laugh").andExpect(status().isOk());
        String inviteId = (String) api.readBody(api.createInvite(alice)).get("inviteId");
        UUID duelId = api.duelView(api.acceptInvite(bob, inviteId)).duelId();

        api.viewDuel(bob, duelId)
                .andExpect(jsonPath("$.opponentCosmetics.cardBack").value("trident"))
                .andExpect(jsonPath("$.opponentCosmetics.frame").doesNotExist());

        emote(alice, duelId, "emote-laugh").andExpect(status().isNoContent());
        emote(alice, duelId, "emote-laugh")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("EMOTE_TOO_FAST"));
        emote(bob, duelId, "emote-laugh")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("NOT_OWNED"));
        var carol = api.register(ApiDriver.uniqueUsername("carol"));
        emote(carol, duelId, "emote-laugh").andExpect(status().isForbidden());
    }

    private ResultActions emote(ApiDriver.Player player, UUID duelId, String code) throws Exception {
        return mvc.perform(post("/api/v1/duels/{id}/emotes", duelId)
                .headers(api.bearer(player))
                .contentType(MediaType.APPLICATION_JSON)
                .content(api.json(Map.of("code", code))));
    }

    @Test
    void aVerifiedStarsPaymentCreditsCoinsExactlyOnce() throws Exception {
        String payload = stars.payloadFor(alice.id(), "coins-1000");
        assertThat(stars.verify(payload, "coins-1000", 50)).isTrue();
        assertThat(stars.verify(payload, "coins-1000", 1)).isFalse();
        assertThat(stars.verify(payload.replace("coins-1000", "coins-12000"), "coins-12000", 500))
                .isFalse();

        String update =
                """
                {"update_id": 9, "message": {"message_id": 1, "chat": {"id": 42, "type": "private"},
                 "successful_payment": {"currency": "XTR", "total_amount": 50, "invoice_payload": "%s",
                 "telegram_payment_charge_id": "%s"}}}
                """
                        .formatted(payload, realisticChargeId());
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/v1/telegram/webhook")
                            .header("X-Telegram-Bot-Api-Secret-Token", bot.webhookSecret())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(update))
                    .andExpect(status().isOk());
        }

        assertThat(wallets.balance(alice.id())).isEqualTo(500 + 1000);
    }

    /** Real Stars charge ids are long opaque strings; the ledger reference must hold them. */
    private static String realisticChargeId() {
        return "stxA" + (UUID.randomUUID().toString() + UUID.randomUUID() + UUID.randomUUID()).replace("-", "")
                + "_Zq9-xYk2LmN0pQr";
    }

    @Test
    void aForgedPaymentPayloadCreditsNothing() throws Exception {
        String update =
                """
                {"update_id": 10, "message": {"message_id": 1, "chat": {"id": 42, "type": "private"},
                 "successful_payment": {"currency": "XTR", "total_amount": 500,
                 "invoice_payload": "%s.coins-12000.n.forged", "telegram_payment_charge_id": "charge-forged"}}}
                """
                        .formatted(alice.id());
        mvc.perform(post("/api/v1/telegram/webhook")
                        .header("X-Telegram-Bot-Api-Secret-Token", bot.webhookSecret())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(update))
                .andExpect(status().isOk());

        assertThat(wallets.balance(alice.id())).isEqualTo(500);
    }
}
