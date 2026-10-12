package cardwar.bot.client;

import cardwar.monetization.payment.PaymentGateway;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Stars invoices through the bot's Bot API client; monetization sees only the PaymentGateway port. */
@Component
public class BotPaymentGateway implements PaymentGateway {

    private final TelegramBotApi api;

    public BotPaymentGateway(TelegramBotApi api) {
        this.api = api;
    }

    @Override
    public Optional<String> createStarsInvoiceLink(String title, String description, String payload, long stars) {
        return api.createInvoiceLink(title, description, payload, stars);
    }
}
