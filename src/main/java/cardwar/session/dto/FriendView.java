package cardwar.session.dto;

import java.time.Instant;
import java.util.UUID;

/** Somebody the caller has played, and how it went between them. */
public record FriendView(
        UUID playerId, String username, String displayName, long played, long won, long lost, Instant lastPlayedAt) {}
