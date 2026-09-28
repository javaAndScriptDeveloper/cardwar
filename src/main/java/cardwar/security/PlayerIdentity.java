package cardwar.security;

import java.util.Objects;
import java.util.UUID;

/**
 * The acting player, as every service sees them. Deliberately carries nothing provider-specific: a password
 * login produces one of these today, and a Telegram adapter will produce the same thing later without any
 * service signature changing.
 */
public record PlayerIdentity(UUID playerId, String username) {

    public PlayerIdentity {
        Objects.requireNonNull(playerId, "playerId");
        Objects.requireNonNull(username, "username");
    }
}
