package cardwar.monetization.dto;

import java.util.List;

public record ShopView(List<ShopItemView> items, List<CoinPackView> coinPacks) {}
