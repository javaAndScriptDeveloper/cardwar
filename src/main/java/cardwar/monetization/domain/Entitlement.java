package cardwar.monetization.domain;

import cardwar.monetization.dto.EntitlementSource;
import cardwar.monetization.dto.TargetType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A player owns a target. The player is referenced by id rather than by an entity association: entitlements and
 * accounts are separate modules, and a foreign key is a cheaper coupling than a shared object graph.
 */
@Entity
@Table(name = "entitlement")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Entitlement {

    @Id
    private UUID id;

    @Column(name = "player_id", nullable = false)
    private UUID playerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false)
    private TargetType targetType;

    @Column(name = "target_id", nullable = false)
    private UUID targetId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EntitlementSource source;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    public Entitlement(
            UUID id, UUID playerId, TargetType targetType, UUID targetId, EntitlementSource source, Instant grantedAt) {
        this.id = id;
        this.playerId = playerId;
        this.targetType = targetType;
        this.targetId = targetId;
        this.source = source;
        this.grantedAt = grantedAt;
    }

    /** An expired entitlement is not ownership. */
    public boolean isActiveAt(Instant moment) {
        return expiresAt == null || expiresAt.isAfter(moment);
    }
}
