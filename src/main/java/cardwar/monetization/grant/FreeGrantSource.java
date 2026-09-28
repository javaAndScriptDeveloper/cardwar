package cardwar.monetization.grant;

import cardwar.monetization.dto.EntitlementSource;
import cardwar.monetization.dto.UnlockType;
import org.springframework.stereotype.Component;

/** Free targets are granted on request rather than pre-granted, so a new player's entitlement table starts empty. */
@Component
public class FreeGrantSource implements EntitlementGrantSource {

    @Override
    public UnlockType supports() {
        return UnlockType.FREE;
    }

    @Override
    public GrantDecision evaluate(UnlockContext context) {
        return new GrantDecision.Granted(EntitlementSource.FREE);
    }
}
