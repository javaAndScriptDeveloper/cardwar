package cardwar.wallet.dto;

import java.time.Instant;

/** One ledger row as its owner sees it: signed amount, why, when. The reference stays internal. */
public record CoinTransactionView(long amount, CoinKind kind, Instant createdAt) {}
