package cardwar.catalog.dto;

import cardwar.engine.Rank;
import cardwar.engine.Suit;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * A skin as everything outside the catalog sees it. The multiplier is already resolved, so no caller ever has to
 * know the override-versus-rarity-default rule.
 */
public record CardSkinView(
        UUID id,
        String code,
        Rank rank,
        Suit suit,
        String displayName,
        String imageRef,
        String rarityCode,
        BigDecimal multiplier) {}
