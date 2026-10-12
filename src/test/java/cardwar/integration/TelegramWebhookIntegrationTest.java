package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.bot.service.TelegramBotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** The webhook is public, so the secret header Telegram echoes back is the only thing standing in for auth. */
class TelegramWebhookIntegrationTest extends AbstractIntegrationTest {

    private static final String UPDATE =
            """
            {"update_id": 1, "message": {"message_id": 1, "chat": {"id": 42, "type": "private"}, "text": "/start"}}
            """;

    @Autowired
    MockMvc mvc;

    @Autowired
    TelegramBotService bot;

    @Test
    void anUpdateCarryingTheSecretIsAccepted() throws Exception {
        mvc.perform(post("/api/v1/telegram/webhook")
                        .header("X-Telegram-Bot-Api-Secret-Token", bot.webhookSecret())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE))
                .andExpect(status().isOk());
    }

    @Test
    void anUpdateWithoutTheSecretIsRejected() throws Exception {
        mvc.perform(post("/api/v1/telegram/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/telegram/webhook")
                        .header("X-Telegram-Bot-Api-Secret-Token", "guess")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE))
                .andExpect(status().isForbidden());
    }
}
