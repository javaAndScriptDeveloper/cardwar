package cardwar.session.dto;

import java.time.Instant;
import java.util.UUID;

/** A challenge waiting for the caller: who sent it, for how much, until when. */
public record ChallengeView(UUID inviteId, From from, long stake, Instant expiresAt) {

    public record From(UUID playerId, String username, String displayName) {}
}
