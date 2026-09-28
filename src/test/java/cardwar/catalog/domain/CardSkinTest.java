package cardwar.catalog.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** The multiplier rule is the one piece of catalog logic that is not a query, so it gets a plain unit test. */
class CardSkinTest {

    @Test
    void multiplierIsInheritedFromRarityWhenNoOverrideIsSet() {
        CardSkin skin = skinWith(rarity("1.50"), null);

        assertThat(skin.effectiveMultiplier()).isEqualByComparingTo("1.50");
    }

    @Test
    void multiplierOverrideWinsOverRarityDefault() {
        CardSkin skin = skinWith(rarity("1.50"), new BigDecimal("3.00"));

        assertThat(skin.effectiveMultiplier()).isEqualByComparingTo("3.00");
    }

    @Test
    void changingTheRarityDefaultChangesEverySkinWithoutAnOverride() {
        Rarity rare = rarity("1.50");
        CardSkin skin = skinWith(rare, null);

        rare.setDefaultMultiplier(new BigDecimal("2.00"));

        assertThat(skin.effectiveMultiplier()).isEqualByComparingTo("2.00");
    }

    private static Rarity rarity(String defaultMultiplier) {
        var rarity = new Rarity();
        rarity.setCode("TEST");
        rarity.setName("Test");
        rarity.setDefaultMultiplier(new BigDecimal(defaultMultiplier));
        return rarity;
    }

    private static CardSkin skinWith(Rarity rarity, BigDecimal override) {
        var skin = new CardSkin();
        skin.setRarity(rarity);
        skin.setMultiplierOverride(override);
        return skin;
    }
}
