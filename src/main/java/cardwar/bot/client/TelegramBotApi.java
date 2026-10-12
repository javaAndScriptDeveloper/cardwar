package cardwar.bot.client;

/** The one Bot API call the bot makes. An interface so the reply logic is tested without a network. */
public interface TelegramBotApi {

    /**
     * Sends {@code text} with a single button that opens {@code buttonUrl} as a Mini App. Never throws; false when
     * Telegram did not take the message.
     */
    boolean sendMessage(long chatId, String text, String buttonText, String buttonUrl);
}
