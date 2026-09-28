package cardwar.monetization.dto;

/** How a player came to own something. Persisted, so these values are part of the stored history. */
public enum EntitlementSource {
    FREE,
    PROGRESS,
    CURRENCY,
    PURCHASE
}
