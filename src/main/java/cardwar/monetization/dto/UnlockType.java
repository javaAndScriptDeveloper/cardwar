package cardwar.monetization.dto;

/**
 * How a target may be acquired. Each value is served by exactly one grant source, so adding a new way to acquire
 * a skin means adding a value and an implementation — never editing the entitlement service.
 */
public enum UnlockType {
    FREE,
    PROGRESS,
    CURRENCY,
    PURCHASE
}
