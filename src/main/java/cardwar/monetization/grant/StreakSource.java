package cardwar.monetization.grant;

import java.util.UUID;

/**
 * Where the shop learns a player's best win streak, which earns WIN_STREAK items. The streak itself belongs to the
 * account module; this port keeps monetization from reaching into it and lets the default (nobody has a streak)
 * stand until the account-backed bean exists.
 */
@FunctionalInterface
public interface StreakSource {

    /** The longest run of consecutive wins the player has ever had; 0 when unknown. */
    int bestWinStreak(UUID playerId);
}
