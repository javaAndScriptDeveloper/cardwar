package cardwar.bot.client;

import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Bot API over HTTPS. The token is part of every request path, so an exception from here is never logged with its
 * message, which can quote the URL.
 */
@Slf4j
public class RestTelegramBotApi implements TelegramBotApi {

    private final RestClient http;
    private final String botToken;

    public RestTelegramBotApi(RestClient.Builder builder, String apiUrl, String botToken) {
        this.http = builder.baseUrl(apiUrl).build();
        this.botToken = botToken;
    }

    @Override
    public boolean sendMessage(long chatId, String text, String buttonText, String buttonUrl) {
        var button = Map.of("text", buttonText, "web_app", Map.of("url", buttonUrl));
        var body = Map.of(
                "chat_id", chatId, "text", text, "reply_markup", Map.of("inline_keyboard", List.of(List.of(button))));
        try {
            http.post()
                    // Concatenated, not a template variable: a variable would percent-encode the token's colon.
                    .uri("/bot" + botToken + "/sendMessage")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientException failed) {
            // Telegram re-delivers an update only when the webhook fails, not when our reply does; a lost greeting
            // costs the user one more /start, so it is logged and dropped.
            log.warn(
                    "Bot reply to chat {} failed: {}", chatId, failed.getClass().getSimpleName());
            return false;
        }
    }

    @Override
    public java.util.Optional<String> createInvoiceLink(String title, String description, String payload, long stars) {
        var body = Map.of(
                "title", title,
                "description", description,
                "payload", payload,
                "currency", "XTR",
                "prices", List.of(Map.of("label", title, "amount", stars)));
        try {
            var answer = http.post()
                    .uri("/bot" + botToken + "/createInvoiceLink")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            Object link = answer == null ? null : answer.get("result");
            return link instanceof String text ? java.util.Optional.of(text) : java.util.Optional.empty();
        } catch (RestClientException failed) {
            log.warn("Creating a Stars invoice failed: {}", failed.getClass().getSimpleName());
            return java.util.Optional.empty();
        }
    }

    @Override
    public boolean answerPreCheckoutQuery(String queryId, boolean ok, String errorMessage) {
        var body = ok
                ? Map.<String, Object>of("pre_checkout_query_id", queryId, "ok", true)
                : Map.<String, Object>of("pre_checkout_query_id", queryId, "ok", false, "error_message", errorMessage);
        try {
            http.post()
                    .uri("/bot" + botToken + "/answerPreCheckoutQuery")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientException failed) {
            log.warn(
                    "Answering a pre-checkout query failed: {}",
                    failed.getClass().getSimpleName());
            return false;
        }
    }
}
