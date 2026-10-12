package cardwar.monetization.payment;

import java.util.Optional;

/**
 * Where Stars invoices come from: the Telegram Bot API in production. An interface here so monetization never
 * depends on the bot module (the bot module implements it and calls back into StarsService for payments).
 */
public interface PaymentGateway {

    /** A t.me invoice link, or empty when Telegram refused or could not be reached. */
    Optional<String> createStarsInvoiceLink(String title, String description, String payload, long stars);
}
