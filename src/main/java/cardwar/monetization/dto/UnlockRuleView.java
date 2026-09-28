package cardwar.monetization.dto;

import java.util.UUID;

/** The conditions attached to one target. Thresholds and prices are data, never constants in code. */
public record UnlockRuleView(
        TargetType targetType, UUID targetId, UnlockType ruleType, Integer threshold, Long price, String currency) {}
