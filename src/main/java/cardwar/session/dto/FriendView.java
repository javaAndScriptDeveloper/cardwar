package cardwar.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

/** Somebody the caller has played, and how it went between them. Handle and photo are left out when absent. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FriendView(
        UUID playerId,
        String username,
        String displayName,
        String handle,
        String photoUrl,
        long played,
        long won,
        long lost,
        Instant lastPlayedAt) {}
