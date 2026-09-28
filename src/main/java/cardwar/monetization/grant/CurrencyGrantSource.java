package cardwar.monetization.grant;

import cardwar.monetization.dto.EntitlementSource;
import cardwar.monetization.dto.UnlockType;
import org.springframework.stereotype.Component;

/**
 * Bought with the in-game balance. The check happens here; the deduction happens in the entitlement service, in
 * the same transaction as the insert, so a charge can never outlive a failed grant.
 */
@Component
public class CurrencyGrantSource implements EntitlementGrantSource {

    @Override
    public UnlockType supports() {
        return UnlockType.CURRENCY;
    }

    @Override
    public GrantDecision evaluate(UnlockContext context) {
        Long price = context.rule().price();
        if (price == null) {
            return new GrantDecision.Unavailable("Currency rule has no price configured");
        }
        if (context.currencyBalance() < price) {
            return new GrantDecision.Rejected("Costs " + price + ", balance is " + context.currencyBalance());
        }
        return new GrantDecision.Granted(EntitlementSource.CURRENCY, price);
    }
}
