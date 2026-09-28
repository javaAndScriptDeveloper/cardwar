package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.catalog.domain.CardSkin;
import cardwar.catalog.domain.CatalogFixtures;
import cardwar.catalog.domain.DeckTheme;
import cardwar.catalog.repository.CardSkinRepository;
import cardwar.catalog.repository.DeckThemeRepository;
import cardwar.catalog.repository.RarityRepository;
import cardwar.engine.Rank;
import cardwar.engine.Suit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * The catalog against the real seed data. Skins are data, so these tests read what Liquibase seeded rather than
 * fixtures of their own — if the seed drifts from the spec, this is where it shows.
 */
class CatalogIntegrationTest extends AbstractIntegrationTest {

    private static final int DECK_SIZE = Rank.values().length * Suit.values().length;

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DeckThemeRepository themes;

    @Autowired
    CardSkinRepository skins;

    @Autowired
    RarityRepository rarities;

    @Autowired
    CacheManager cacheManager;

    @Autowired
    TransactionTemplate tx;

    ApiDriver api;
    ApiDriver.Player player;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        player = api.register(ApiDriver.uniqueUsername("cat"));
    }

    @AfterEach
    void evictCatalogCache() {
        cacheManager.getCache("catalog").clear();
    }

    @Test
    void classicThemeHasAllThirtySixCardsExactlyOnce() throws Exception {
        var body =
                api.readBody(mvc.perform(get("/api/v1/catalog/themes/CLASSIC").headers(ApiDriver.bearer(player)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.theme.code").value("CLASSIC"))
                        .andExpect(jsonPath("$.theme.isDefault").value(true)));

        @SuppressWarnings("unchecked")
        var skinRows = (List<Map<String, Object>>) body.get("skins");
        assertThat(skinRows).hasSize(DECK_SIZE);
        assertThat(skinRows.stream().map(row -> row.get("rank") + "/" + row.get("suit")))
                .doesNotHaveDuplicates()
                .hasSize(DECK_SIZE);
    }

    @Test
    void defaultThemeIsClassic() throws Exception {
        mvc.perform(get("/api/v1/catalog/themes/default").headers(ApiDriver.bearer(player)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.theme.code").value("CLASSIC"));
    }

    @Test
    void effectiveMultiplierIsOverrideWhenSetAndRarityDefaultOtherwise() throws Exception {
        var body =
                api.readBody(mvc.perform(get("/api/v1/catalog/themes/VANGUARD").headers(ApiDriver.bearer(player)))
                        .andExpect(status().isOk()));

        @SuppressWarnings("unchecked")
        var skinRows = (List<Map<String, Object>>) body.get("skins");
        Map<String, Object> overridden = byCode(skinRows, "VANGUARD_ACE_SPADES");
        Map<String, Object> inherited = byCode(skinRows, "VANGUARD_ACE_CLUBS");

        assertThat(overridden.get("rarityCode")).isEqualTo("LEGENDARY");
        assertThat(inherited.get("rarityCode")).isEqualTo("LEGENDARY");
        assertThat(((Number) overridden.get("multiplier")).doubleValue()).isEqualTo(7.5);
        assertThat(((Number) inherited.get("multiplier")).doubleValue()).isEqualTo(5.0);
    }

    @Test
    void inactiveSkinsAreExcludedFromTheThemeMapping() throws Exception {
        UUID themeId = seedTheme("INACTIVE_TEST", "inactive-test");
        try {
            var body = api.readBody(
                    mvc.perform(get("/api/v1/catalog/themes/INACTIVE_TEST").headers(ApiDriver.bearer(player)))
                            .andExpect(status().isOk()));

            @SuppressWarnings("unchecked")
            var skinRows = (List<Map<String, Object>>) body.get("skins");
            assertThat(skinRows).extracting(row -> row.get("code")).containsExactly("INACTIVE_TEST_ACTIVE");
        } finally {
            tx.executeWithoutResult(ignored -> themes.deleteById(themeId));
        }
    }

    @Test
    void secondSkinForTheSameRankAndSuitInATheme_isRejectedByTheDatabase() {
        UUID themeId = seedTheme("UNIQUE_TEST", "unique-test");
        try {
            assertThatThrownBy(() -> tx.executeWithoutResult(ignored -> {
                        DeckTheme theme = themes.findById(themeId).orElseThrow();
                        skins.saveAndFlush(skin(theme, "UNIQUE_TEST_DUPLICATE", Rank.SIX, Suit.CLUBS, true));
                    }))
                    .isInstanceOf(DataIntegrityViolationException.class);
        } finally {
            tx.executeWithoutResult(ignored -> themes.deleteById(themeId));
        }
    }

    @Test
    void unknownThemeIsAProblemDetail404() throws Exception {
        mvc.perform(get("/api/v1/catalog/themes/NO_SUCH_THEME").headers(ApiDriver.bearer(player)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").isString());
    }

    @Test
    void repeatedReadsAreServedFromTheCache() throws Exception {
        cacheManager.getCache("catalog").clear();
        assertThat(cacheManager.getCache("catalog").get("theme:CLASSIC")).isNull();

        mvc.perform(get("/api/v1/catalog/themes/CLASSIC").headers(ApiDriver.bearer(player)))
                .andExpect(status().isOk());

        assertThat(cacheManager.getCache("catalog").get("theme:CLASSIC")).isNotNull();
    }

    @Test
    void catalogRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/catalog/themes")).andExpect(status().isUnauthorized());
    }

    /** A throwaway theme with one active and one inactive skin on different cards. */
    private UUID seedTheme(String code, String name) {
        return tx.execute(ignored -> {
            DeckTheme theme = themes.saveAndFlush(CatalogFixtures.theme(code, name));
            skins.saveAndFlush(skin(theme, code + "_ACTIVE", Rank.SIX, Suit.CLUBS, true));
            skins.saveAndFlush(skin(theme, code + "_INACTIVE", Rank.SEVEN, Suit.CLUBS, false));
            return theme.getId();
        });
    }

    private CardSkin skin(DeckTheme theme, String code, Rank rank, Suit suit, boolean active) {
        return CatalogFixtures.skin(
                theme, code, rank, suit, rarities.findById("COMMON").orElseThrow(), active);
    }

    private static Map<String, Object> byCode(List<Map<String, Object>> rows, String code) {
        return rows.stream()
                .filter(row -> code.equals(row.get("code")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no skin " + code));
    }
}
