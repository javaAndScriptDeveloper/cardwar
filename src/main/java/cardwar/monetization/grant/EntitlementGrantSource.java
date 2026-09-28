package cardwar.monetization.grant;

import cardwar.monetization.dto.UnlockType;

/**
 * One way to acquire a target. Implementations are keyed by the rule type they serve, so a new acquisition path
 * — Telegram Stars, a promo code, a season pass — arrives as a new implementation and a new enum value, without
 * touching the service that dispatches to them.
 */
public interface EntitlementGrantSource {

    /** The rule type this source is the sole handler for. */
    UnlockType supports();

    GrantDecision evaluate(UnlockContext context);
}
