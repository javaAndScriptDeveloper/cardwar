package cardwar.account.dto;

import java.util.UUID;

/** The public face of an account — no credential material, ever. */
public record PlayerSummary(UUID id, String username, String displayName) {}
