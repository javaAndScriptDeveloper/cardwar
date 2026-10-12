package cardwar.monetization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "owned_item")
@IdClass(OwnedItem.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OwnedItem {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Id
    @Column(name = "item_code")
    private String itemCode;

    @Column(name = "source", nullable = false)
    private String source;

    @Column(name = "acquired_at", nullable = false)
    private Instant acquiredAt;

    public OwnedItem(UUID playerId, String itemCode, String source, Instant acquiredAt) {
        this.playerId = playerId;
        this.itemCode = itemCode;
        this.source = source;
        this.acquiredAt = acquiredAt;
    }

    public record Key(UUID playerId, String itemCode) implements Serializable {}
}
