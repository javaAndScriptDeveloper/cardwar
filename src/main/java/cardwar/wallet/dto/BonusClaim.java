package cardwar.wallet.dto;

import java.time.LocalDate;

public record BonusClaim(LocalDate date, int streakDay, long amount) {}
