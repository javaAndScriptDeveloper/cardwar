package cardwar.monetization.domain;

import cardwar.monetization.dto.TargetType;
import cardwar.monetization.dto.UnlockType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** How one target may be unlocked. Editable independently of any game logic. */
@Entity
@Table(name = "unlock_rule")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UnlockRule {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false)
    private TargetType targetType;

    @Column(name = "target_id", nullable = false)
    private UUID targetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "rule_type", nullable = false)
    private UnlockType ruleType;

    private Integer threshold;

    private Long price;

    private String currency;
}
