package cardwar.monetization.grant;

import cardwar.monetization.dto.EntitlementSource;
import cardwar.monetization.dto.UnlockType;
import org.springframework.stereotype.Component;

/** Unlocked by playing. The threshold is a column on the rule, never a constant here. */
@Component
public class ProgressGrantSource implements EntitlementGrantSource {

    @Override
    public UnlockType supports() {
        return UnlockType.PROGRESS;
    }

    @Override
    public GrantDecision evaluate(UnlockContext context) {
        Integer threshold = context.rule().threshold();
        if (threshold == null) {
            return new GrantDecision.Unavailable("Progress rule has no threshold configured");
        }
        if (context.duelsWon() < threshold) {
            return new GrantDecision.Rejected("Requires " + threshold + " duels won, have " + context.duelsWon());
        }
        return new GrantDecision.Granted(EntitlementSource.PROGRESS);
    }
}
