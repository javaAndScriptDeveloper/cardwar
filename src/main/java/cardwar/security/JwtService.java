package cardwar.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Issues and verifies the bearer tokens the API authenticates with.
 *
 * <p>Stateless by design: the whole point is that a future Telegram adapter can validate Telegram's own
 * signature and then mint one of these, so verification, the filter chain and every service signature are
 * written exactly once.
 */
@Slf4j
@Component
// The bearer filter's resolver. The Telegram resolver only ever runs at the initData exchange endpoint.
@Primary
public class JwtService implements PrincipalResolver {

    private static final String USERNAME_CLAIM = "usr";

    private final SecretKey key;
    private final Duration ttl;
    private final String issuer;

    public JwtService(JwtProperties properties) {
        this.ttl = properties.ttl();
        this.issuer = properties.issuer();
        this.key = resolveKey(properties);
    }

    /** The issued token and the moment it stops being accepted. */
    public record IssuedToken(String token, Instant expiresAt) {}

    public IssuedToken issue(PlayerIdentity identity) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(ttl);
        String token = Jwts.builder()
                .issuer(issuer)
                .subject(identity.playerId().toString())
                .claim(USERNAME_CLAIM, identity.username())
                .issuedAt(java.util.Date.from(now))
                .expiration(java.util.Date.from(expiresAt))
                .signWith(key)
                .compact();
        return new IssuedToken(token, expiresAt);
    }

    @Override
    public Optional<PlayerIdentity> resolve(String credential) {
        if (credential == null || credential.isBlank()) {
            return Optional.empty();
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(issuer)
                    .build()
                    .parseSignedClaims(credential)
                    .getPayload();
            var playerId = UUID.fromString(claims.getSubject());
            var username = claims.get(USERNAME_CLAIM, String.class);
            return Optional.of(new PlayerIdentity(playerId, username));
        } catch (JwtException | IllegalArgumentException ex) {
            // Never log the token itself: it is a live credential until it expires.
            log.debug("Rejected a bearer token: {}", ex.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    /**
     * Outside production a missing secret yields an ephemeral random one, so a developer can run the app without
     * ceremony — tokens simply stop working across restarts. Production never reaches here without a secret:
     * {@link ProductionSecretsCheck} fails startup first.
     */
    private static SecretKey resolveKey(JwtProperties properties) {
        if (!properties.hasSecret()) {
            log.warn("No cardwar.security.jwt.secret configured — generating an ephemeral one for this run. "
                    + "Tokens will not survive a restart. Set JWT_SECRET for anything but local development.");
            var material = new byte[JwtProperties.MIN_SECRET_BYTES];
            new SecureRandom().nextBytes(material);
            return new SecretKeySpec(material, "HmacSHA256");
        }
        byte[] material = decode(properties.secret());
        if (material.length < JwtProperties.MIN_SECRET_BYTES) {
            throw new IllegalStateException("cardwar.security.jwt.secret must be at least "
                    + JwtProperties.MIN_SECRET_BYTES + " bytes; HS256 cannot be signed safely with less");
        }
        return new SecretKeySpec(material, "HmacSHA256");
    }

    /** Accepts a base64 secret (the documented form) and falls back to raw UTF-8 bytes. */
    private static byte[] decode(String secret) {
        try {
            return Base64.getDecoder().decode(secret);
        } catch (IllegalArgumentException notBase64) {
            return secret.getBytes(StandardCharsets.UTF_8);
        }
    }
}
