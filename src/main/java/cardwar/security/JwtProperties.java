package cardwar.security;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Token signing configuration. {@code secret} has no default anywhere in the codebase: a defaulted signing
 * secret looks like authentication without being it, so production is required to supply one.
 */
@ConfigurationProperties(prefix = "cardwar.security.jwt")
public record JwtProperties(String secret, Duration ttl, String issuer) {

    /** HS256 needs at least a 256-bit key; anything shorter is rejected rather than silently padded. */
    public static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        ttl = ttl == null ? Duration.ofHours(2) : ttl;
        issuer = issuer == null || issuer.isBlank() ? "cardwar" : issuer;
    }

    public boolean hasSecret() {
        return secret != null && !secret.isBlank();
    }
}
