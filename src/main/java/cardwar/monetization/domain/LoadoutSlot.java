package cardwar.monetization.domain;

import cardwar.monetization.dto.ItemType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** The item equipped in one slot (deck, back, table, frame) for one player. */
@Entity
@Table(name = "loadout")
@IdClass(LoadoutSlot.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoadoutSlot {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "item_type")
    private ItemType type;

    @Column(name = "item_code", nullable = false)
    private String itemCode;

    public LoadoutSlot(UUID playerId, ItemType type, String itemCode) {
        this.playerId = playerId;
        this.type = type;
        this.itemCode = itemCode;
    }

    public void equip(String code) {
        this.itemCode = code;
    }

    public record Key(UUID playerId, ItemType type) implements Serializable {}
}
