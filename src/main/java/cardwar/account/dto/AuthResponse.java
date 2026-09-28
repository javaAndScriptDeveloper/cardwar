package cardwar.account.dto;

import java.time.Instant;
import java.util.UUID;

/** The issued bearer token. The token itself is a credential and is never logged. */
public record AuthResponse(UUID playerId, String username, String token, Instant expiresAt) {}
