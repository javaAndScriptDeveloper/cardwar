package cardwar.monetization.dto;

import java.util.UUID;

/** A target the player does not own, together with what it would take to unlock it. */
public record LockedItemView(
        TargetType targetType, UUID targetId, String code, String displayName, UnlockRuleView unlockRule) {}
