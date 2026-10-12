package cardwar.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

/** A challenge waiting for the caller: who sent it, for how much, until when. */
public record ChallengeView(UUID inviteId, From from, long stake, Instant expiresAt) {

    /** The sender as the inbox shows them; handle and photo are left out when absent. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record From(UUID playerId, String username, String displayName, String handle, String photoUrl) {}
}
