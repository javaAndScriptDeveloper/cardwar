package cardwar.monetization.dto;

import java.time.Instant;
import java.util.UUID;

public record OwnedItemView(
        TargetType targetType,
        UUID targetId,
        String code,
        String displayName,
        EntitlementSource source,
        Instant grantedAt,
        Instant expiresAt) {}
