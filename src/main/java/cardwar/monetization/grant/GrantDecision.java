package cardwar.monetization.grant;

import cardwar.monetization.dto.EntitlementSource;

/**
 * The outcome of evaluating one unlock rule. Sealed so that every caller has to handle the fact that a rule can
 * be refused (the player has not met it) or unavailable (nothing here can satisfy it yet) — the two map to very
 * different HTTP answers and collapsing them would hide an unimplemented payment path behind a plain refusal.
 */
public sealed interface GrantDecision {

    /** The rule is satisfied. {@code currencySpent} is deducted in the same transaction as the grant. */
    record Granted(EntitlementSource source, long currencySpent) implements GrantDecision {
        public Granted(EntitlementSource source) {
            this(source, 0L);
        }
    }

    /** The rule exists and the player does not meet it. */
    record Rejected(String reason) implements GrantDecision {}

    /** The rule exists but cannot be evaluated in this build — a payment provider is not wired up yet. */
    record Unavailable(String reason) implements GrantDecision {}
}
