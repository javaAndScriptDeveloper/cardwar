package cardwar.monetization.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * One shop item as the caller sees it. {@code unlock} is absent for an item coins simply buy; {@code availableUntil}
 * is present only while a drop is on sale, so the client can count down to the Kyiv Monday that ends it.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ShopItemView(
        String code,
        ItemType type,
        String contentRef,
        String name,
        long price,
        boolean owned,
        boolean equipped,
        UnlockView unlock,
        Instant availableUntil) {}
