package cardwar.support;

import cardwar.bot.client.TelegramBotApi;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * The shared test context's Bot API: every message the app would send to Telegram is kept here instead, so a test
 * can read the DM a feature produced. Invoices and checkout answers keep the interface defaults (no payments), which
 * is also what the real client answers when Telegram is unreachable.
 */
public final class RecordingTelegramBotApi implements TelegramBotApi {

    public record Sent(long chatId, String text, String buttonText, String buttonUrl) {}

    private final List<Sent> sent = new CopyOnWriteArrayList<>();

    @Override
    public boolean sendMessage(long chatId, String text, String buttonText, String buttonUrl) {
        sent.add(new Sent(chatId, text, buttonText, buttonUrl));
        return true;
    }

    /** Messages sent to one chat, oldest first; tests share the context, so they filter by their own chat ids. */
    public List<Sent> sentTo(long chatId) {
        return sent.stream().filter(message -> message.chatId() == chatId).toList();
    }
}
