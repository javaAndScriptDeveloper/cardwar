package cardwar.bot.controller;

import cardwar.bot.service.TelegramBotService;
import cardwar.exception.ForbiddenException;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Telegram delivers bot updates here (registered with setWebhook). Not part of the player API. */
@Hidden
@RestController
public class TelegramWebhookController {

    private final TelegramBotService bot;

    public TelegramWebhookController(TelegramBotService bot) {
        this.bot = bot;
    }

    @PostMapping("/api/v1/telegram/webhook")
    public void update(
            @RequestHeader(name = "X-Telegram-Bot-Api-Secret-Token", required = false) String secret,
            @RequestBody JsonNode update) {
        if (!bot.acceptsSecret(secret)) {
            throw new ForbiddenException("Unknown webhook caller");
        }
        bot.handle(update);
    }
}
