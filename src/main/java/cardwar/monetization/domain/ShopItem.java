package cardwar.monetization.domain;

import cardwar.monetization.dto.ItemType;
import cardwar.monetization.dto.UnlockKind;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** One cosmetic in the shop. Rows are content: prices and names change by data, not code. */
@Entity
@Table(name = "shop_item")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ShopItem {

    @Id
    @Column(name = "code")
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false)
    private ItemType type;

    @Column(name = "content_ref", nullable = false)
    private String contentRef;

    @Column(name = "name_uk", nullable = false)
    private String name;

    @Column(name = "price", nullable = false)
    private long price;

    @Column(name = "is_default", nullable = false)
    private boolean defaultItem;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Enumerated(EnumType.STRING)
    @Column(name = "unlock_kind", nullable = false)
    private UnlockKind unlockKind;

    /** The streak length for a WIN_STREAK item; 0 otherwise. */
    @Column(name = "unlock_value", nullable = false)
    private int unlockValue;

    /** 0..3 for a weekly drop (on sale when the Kyiv ISO week mod 4 equals it); null for an always-on item. */
    @Column(name = "drop_slot")
    private Integer dropSlot;

    public boolean isEarned() {
        return unlockKind == UnlockKind.WIN_STREAK;
    }

    public boolean isDrop() {
        return dropSlot != null;
    }
}
