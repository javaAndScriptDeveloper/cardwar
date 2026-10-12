package cardwar.session.dto;

import java.util.UUID;

/**
 * One row of the friends leaderboard: a friend (or the caller, flagged {@code you}) with their wins and the coins
 * those wins brought in over the window. {@code playerId} sits beside the profile because the profile view carries
 * no id and the client needs a stable key.
 */
public record LeaderboardEntry(UUID playerId, PlayerProfileView player, int wins, long coinsWon, boolean you) {}
