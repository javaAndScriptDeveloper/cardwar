package cardwar.wallet.dto;

/** The caller's coins and whether today's bonus is waiting. */
public record WalletView(long balance, DailyBonusView dailyBonus) {}
