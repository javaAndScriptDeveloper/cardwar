package cardwar.monetization.dto;

public record ShopItemView(
        String code, ItemType type, String contentRef, String name, long price, boolean owned, boolean equipped) {}
