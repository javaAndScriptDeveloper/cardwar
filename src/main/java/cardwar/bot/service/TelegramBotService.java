package cardwar.bot.service;

import cardwar.bot.BotProperties;
import cardwar.bot.client.TelegramBotApi;
import cardwar.security.telegram.TelegramProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * The bot's chat side: whoever writes to it gets told to press Play, with a button that opens the Mini App. A
 * {@code /start <invite>} deep link gets a button that opens the app on that invite, which is how an invite link
 * reaches the app without a BotFather-configured Main Mini App.
 */
@Service
public class TelegramBotService {

    static final String GREETING =
            """
            Cardwar: two-player Durak, right here in Telegram.

            Tap Play to open the game. Invite a friend from there, or paste the code a friend sent you.""";

    static final String INVITED =
            """
            A friend has invited you to a duel of Durak.

            Tap Join the duel to start playing.""";

    /** Invite ids are UUIDs; anything else is not worth a link. */
    private static final Pattern INVITE = Pattern.compile("[0-9a-fA-F-]{36}");

    private final BotProperties properties;
    private final TelegramBotApi api;
    private final String webhookSecret;

    public TelegramBotService(TelegramProperties telegram, BotProperties properties, TelegramBotApi api) {
        this.properties = properties;
        this.api = api;
        this.webhookSecret = telegram.hasBotToken() ? derive(telegram.botToken()) : null;
    }

    /**
     * The value registered with {@code setWebhook} as {@code secret_token}. Derived from the bot token so there is no
     * second secret to provision, and one-way so the header never reveals the token. Null without a token.
     */
    public String webhookSecret() {
        return webhookSecret;
    }

    public boolean acceptsSecret(String presented) {
        return webhookSecret != null
                && presented != null
                && MessageDigest.isEqual(
                        webhookSecret.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8));
    }

    public void handle(JsonNode update) {
        JsonNode message = update.path("message");
        if (!"private".equals(message.path("chat").path("type").asString(""))) {
            // Mini App buttons only work in private chats; groups and other update kinds get no answer.
            return;
        }
        long chatId = message.path("chat").path("id").asLong();
        String text = message.path("text").asString("").strip();
        String invite = inviteOf(text);
        if (invite != null) {
            api.sendMessage(chatId, INVITED, "Join the duel", properties.miniAppUrl() + "?invite=" + invite);
        } else {
            api.sendMessage(chatId, GREETING, "Play", properties.miniAppUrl());
        }
    }

    private static String inviteOf(String text) {
        if (!text.startsWith("/start ")) {
            return null;
        }
        String payload = text.substring("/start ".length()).strip();
        return INVITE.matcher(payload).matches() ? payload : null;
    }

    private static String derive(String botToken) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(botToken.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal("cardwar-webhook".getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException impossible) {
            throw new IllegalStateException("HmacSHA256 is a required JDK algorithm", impossible);
        }
    }
}
