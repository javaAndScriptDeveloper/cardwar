package cardwar.wallet.dto;

/** Why coins moved. Stored as text in the ledger; part of the idempotency key with the reference. */
public enum CoinKind {
    STARTER,
    LEGACY,
    DAILY_BONUS,
    STAKE_ESCROW,
    STAKE_PAYOUT,
    STAKE_REFUND,
    /** The house's extra on a staked win while on a win streak. */
    STREAK_BONUS,
    /** A completed daily mission, claimed. */
    MISSION_REWARD,
    PURCHASE,
    STARS_TOPUP,
    ADJUSTMENT
}
