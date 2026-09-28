package cardwar.monetization.grant;

import cardwar.monetization.dto.UnlockRuleView;
import java.util.UUID;

/**
 * Everything a grant source is allowed to know. It is a value, not a repository handle: grant sources decide,
 * the entitlement service writes. That split keeps the decision logic trivially testable and keeps the currency
 * deduction inside the one transaction that also inserts the entitlement.
 */
public record UnlockContext(UUID playerId, UnlockRuleView rule, int duelsWon, long currencyBalance) {}
