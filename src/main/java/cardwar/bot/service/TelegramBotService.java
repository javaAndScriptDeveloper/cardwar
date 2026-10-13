package cardwar.bot.service;

import cardwar.bot.BotProperties;
import cardwar.bot.client.TelegramBotApi;
import cardwar.metrics.GameMetrics;
import cardwar.metrics.GameMetrics.BotOutcome;
import cardwar.monetization.service.StarsService;
import cardwar.security.telegram.TelegramProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
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

    private final GameMetrics metrics;
    private final ObjectProvider<StarsService> stars;

    public TelegramBotService(
            TelegramProperties telegram,
            BotProperties properties,
            TelegramBotApi api,
            GameMetrics metrics,
            ObjectProvider<StarsService> stars) {
        this.properties = properties;
        this.api = api;
        this.metrics = metrics;
        this.stars = stars;
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
        boolean accepted = webhookSecret != null
                && presented != null
                && MessageDigest.isEqual(
                        webhookSecret.getBytes(StandardCharsets.UTF_8), presented.getBytes(StandardCharsets.UTF_8));
        if (!accepted) {
            metrics.botUpdate(BotOutcome.REJECTED);
        }
        return accepted;
    }

    public void handle(JsonNode update) {
        JsonNode checkout = update.path("pre_checkout_query");
        if (!checkout.isMissingNode()) {
            answerCheckout(checkout);
            return;
        }
        JsonNode message = update.path("message");
        JsonNode payment = message.path("successful_payment");
        if (!payment.isMissingNode()) {
            StarsService payments = stars.getIfAvailable();
            boolean credited = payments != null
                    && "XTR".equals(payment.path("currency").asString(""))
                    && payments.credit(
                            payment.path("invoice_payload").asString(""),
                            payment.path("total_amount").asLong(),
                            payment.path("telegram_payment_charge_id").asString(""));
            metrics.botUpdate(credited ? BotOutcome.REPLIED : BotOutcome.FAILED);
            return;
        }
        if (!"private".equals(message.path("chat").path("type").asString(""))) {
            // Mini App buttons only work in private chats; groups and other update kinds get no answer.
            metrics.botUpdate(BotOutcome.IGNORED);
            return;
        }
        long chatId = message.path("chat").path("id").asLong();
        String text = message.path("text").asString("").strip();
        String invite = inviteOf(text);
        boolean sent = invite != null
                ? api.sendMessage(chatId, INVITED, "Join the duel", properties.miniAppUrl() + "?invite=" + invite)
                : api.sendMessage(chatId, GREETING, "Play", properties.miniAppUrl());
        metrics.botUpdate(sent ? BotOutcome.REPLIED : BotOutcome.FAILED);
    }

    /** Tells a friend about a challenge, with a button straight into it. Best effort; never throws. */
    public void notifyChallenge(long chatId, String from, long stake, String inviteId) {
        String text = stake > 0
                ? from + " викликає тебе на дуель на " + stake + " монет."
                : from + " викликає тебе на дружню дуель.";
        boolean sent =
                api.sendMessage(chatId, text, "Прийняти виклик", properties.miniAppUrl() + "?invite=" + inviteId);
        metrics.botUpdate(sent ? BotOutcome.REPLIED : BotOutcome.FAILED);
    }

    /** Tells a player their daily-bonus streak lapses at midnight, with a button into the app. Best effort. */
    public void notifyStreak(long chatId, int streakDays) {
        String text = "🔥 Серія " + streakDays + " " + days(streakDays) + " згорить опівночі. Забери бонус";
        boolean sent = api.sendMessage(chatId, text, "Грати", properties.miniAppUrl());
        metrics.botUpdate(sent ? BotOutcome.REPLIED : BotOutcome.FAILED);
    }

    /** Ukrainian plural of «день»: 1 день, 2–4 дні, 5+ днів, with the 11–14 exception. */
    static String days(int n) {
        int mod10 = n % 10;
        int mod100 = n % 100;
        if (mod10 == 1 && mod100 != 11) {
            return "день";
        }
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            return "дні";
        }
        return "днів";
    }

    /** Telegram waits for this answer before charging: only an invoice we signed, at its own price, goes through. */
    private void answerCheckout(JsonNode query) {
        StarsService payments = stars.getIfAvailable();
        boolean ok = payments != null
                && "XTR".equals(query.path("currency").asString(""))
                && payments.verify(
                        query.path("invoice_payload").asString(""),
                        query.path("total_amount").asLong());
        api.answerPreCheckoutQuery(query.path("id").asString(""), ok, ok ? null : "Цей рахунок недійсний.");
        metrics.botUpdate(ok ? BotOutcome.REPLIED : BotOutcome.REJECTED);
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
