package cardwar.account.dto;

/** Progress as other modules see it. Read-only: only the account module writes these numbers. */
public record ProgressView(int duelsPlayed, int duelsWon, long currencyBalance) {}
