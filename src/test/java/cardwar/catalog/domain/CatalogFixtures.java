package cardwar.catalog.domain;

import cardwar.engine.Rank;
import cardwar.engine.Suit;
import java.util.UUID;

/**
 * Builds catalog entities for tests. The entities keep their no-argument constructors protected so production code
 * cannot half-build one; tests in other packages come through here instead.
 */
public final class CatalogFixtures {

    private CatalogFixtures() {}

    public static DeckTheme theme(String code, String name) {
        var theme = new DeckTheme();
        theme.setId(UUID.randomUUID());
        theme.setCode(code);
        theme.setName(name);
        theme.setDefault(false);
        theme.setActive(true);
        return theme;
    }

    public static CardSkin skin(DeckTheme theme, String code, Rank rank, Suit suit, Rarity rarity, boolean active) {
        var skin = new CardSkin();
        skin.setId(UUID.randomUUID());
        skin.setTheme(theme);
        skin.setRank(rank);
        skin.setSuit(suit);
        skin.setCode(code);
        skin.setDisplayName(code);
        skin.setImageRef("test/" + code + ".svg");
        skin.setRarity(rarity);
        skin.setActive(active);
        return skin;
    }
}
