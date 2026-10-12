package cardwar.wallet.dto;

/** Why coins moved. Stored as text in the ledger; part of the idempotency key with the reference. */
public enum CoinKind {
    STARTER,
    LEGACY,
    DAILY_BONUS,
    STAKE_ESCROW,
    STAKE_PAYOUT,
    STAKE_REFUND,
    PURCHASE,
    STARS_TOPUP,
    ADJUSTMENT
}
