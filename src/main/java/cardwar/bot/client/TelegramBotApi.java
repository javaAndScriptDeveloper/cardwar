package cardwar.bot.client;

/** The one Bot API call the bot makes. An interface so the reply logic is tested without a network. */
public interface TelegramBotApi {

    /**
     * Sends {@code text} with a single button that opens {@code buttonUrl} as a Mini App. Never throws; false when
     * Telegram did not take the message.
     */
    boolean sendMessage(long chatId, String text, String buttonText, String buttonUrl);

    /** A Telegram Stars invoice link (currency XTR); empty when Telegram refused. */
    default java.util.Optional<String> createInvoiceLink(String title, String description, String payload, long stars) {
        return java.util.Optional.empty();
    }

    /** Must be answered within 10 seconds of a pre_checkout_query, or the payment fails. */
    default boolean answerPreCheckoutQuery(String queryId, boolean ok, String errorMessage) {
        return false;
    }
}
