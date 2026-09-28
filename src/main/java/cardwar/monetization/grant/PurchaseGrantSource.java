package cardwar.monetization.grant;

import cardwar.monetization.dto.UnlockType;
import org.springframework.stereotype.Component;

/**
 * Real-money purchases are out of scope for this phase. This implementation exists so the seam is real and the
 * dispatch table is complete: it makes no external call, takes no money, and answers honestly that the path is
 * not open yet. A Telegram Stars implementation replaces this class and nothing else.
 */
@Component
public class PurchaseGrantSource implements EntitlementGrantSource {

    @Override
    public UnlockType supports() {
        return UnlockType.PURCHASE;
    }

    @Override
    public GrantDecision evaluate(UnlockContext context) {
        return new GrantDecision.Unavailable("Purchases are not available yet");
    }
}
