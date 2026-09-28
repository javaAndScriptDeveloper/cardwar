package cardwar.security;

import java.util.Optional;

/**
 * Turns a raw credential presented by some transport into a {@link PlayerIdentity}.
 *
 * <p>The credential is an opaque string on purpose — a bearer token today, a signed Telegram {@code initData}
 * payload later. Adding an identity provider means adding an implementation, not rewriting the filter chain.
 */
public interface PrincipalResolver {

    /** Empty when the credential is absent, malformed, expired or otherwise not trustworthy. */
    Optional<PlayerIdentity> resolve(String credential);
}
