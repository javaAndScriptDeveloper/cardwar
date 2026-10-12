package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.bot.service.TelegramBotService;
import cardwar.monetization.service.StarsService;
import cardwar.wallet.service.WalletService;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/** Coins buy cosmetics; cosmetics are equipped and seen at the table; Stars buy coins. */
class ShopIntegrationTest extends AbstractIntegrationTest {

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

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
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
