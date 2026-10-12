package cardwar.monetization.dto;

import java.util.List;

/** The whole catalogue; {@code drops} repeats the items on sale this week only, in the order the shop shows them. */
public record ShopView(List<ShopItemView> items, List<ShopItemView> drops, List<CoinPackView> coinPacks) {}
