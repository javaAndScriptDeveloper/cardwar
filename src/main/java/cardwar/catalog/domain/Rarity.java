package cardwar.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A rarity tier and the scoring multiplier every skin of that tier inherits unless it overrides it. */
@Entity
@Table(name = "rarity")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Rarity {

    @Id
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "default_multiplier", nullable = false)
    private BigDecimal defaultMultiplier;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
}
