package cardwar.catalog.domain;

import cardwar.engine.Rank;
import cardwar.engine.Suit;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * How one card of one theme is rendered. Rank and suit are stored as the engine's own enum names, which is what
 * makes reassigning a character to a different card an {@code UPDATE} rather than a code change.
 *
 * <p>The dependency runs one way only: the catalog knows the engine's vocabulary, and the engine has never heard
 * of the catalog.
 */
@Entity
@Table(name = "card_skin")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CardSkin {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "theme_id", nullable = false)
    private DeckTheme theme;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_rank", nullable = false)
    private Rank rank;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_suit", nullable = false)
    private Suit suit;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "image_ref", nullable = false)
    private String imageRef;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "rarity_code", nullable = false)
    private Rarity rarity;

    @Column(name = "multiplier_override")
    private BigDecimal multiplierOverride;

    @Column(nullable = false)
    private boolean active;

    /** Multipliers are data: an override when one is set, the rarity's default otherwise. Never a constant. */
    public BigDecimal effectiveMultiplier() {
        return multiplierOverride != null ? multiplierOverride : rarity.getDefaultMultiplier();
    }
}
