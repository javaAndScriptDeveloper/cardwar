package cardwar.catalog.service;

import cardwar.catalog.domain.CardSkin;
import cardwar.catalog.domain.DeckTheme;
import cardwar.catalog.dto.CardSkinView;
import cardwar.catalog.dto.DeckThemeView;
import cardwar.catalog.dto.ThemeCatalogView;
import cardwar.catalog.repository.CardSkinRepository;
import cardwar.catalog.repository.DeckThemeRepository;
import cardwar.exception.NotFoundException;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read access to the skin catalog. The data is a few hundred rows that change by hand, so reads are cached; the
 * cache name is declared up front in {@code application.yml} so a typo fails fast instead of creating a cache.
 */
@Service
public class CatalogService {

    private final DeckThemeRepository themes;
    private final CardSkinRepository skins;

    public CatalogService(DeckThemeRepository themes, CardSkinRepository skins) {
        this.themes = themes;
        this.skins = skins;
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'themes'")
    public List<DeckThemeView> listThemes() {
        return themes.findAllByActiveTrueOrderByCode().stream()
                .map(CatalogService::toView)
                .toList();
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'theme:' + #code")
    public ThemeCatalogView themeByCode(String code) {
        DeckTheme theme = themes.findByCode(code).orElseThrow(() -> new NotFoundException("Unknown deck theme"));
        return new ThemeCatalogView(toView(theme), skinViews(theme.getId()));
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'default-theme'")
    public ThemeCatalogView defaultTheme() {
        DeckTheme theme =
                themes.findByIsDefaultTrue().orElseThrow(() -> new NotFoundException("No default deck theme"));
        return new ThemeCatalogView(toView(theme), skinViews(theme.getId()));
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'skin:' + #code")
    public CardSkinView skinByCode(String code) {
        return skins.findByCodeWithRarity(code)
                .filter(CardSkin::isActive)
                .map(CatalogService::toView)
                .orElseThrow(() -> new NotFoundException("Unknown card skin"));
    }

    /**
     * Lookups by id, for callers that hold a target id rather than a code — the entitlement module stores ids so
     * that renaming a skin's code never orphans somebody's collection.
     */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'skin-id:' + #id")
    public CardSkinView skinById(UUID id) {
        return skins.findByIdWithRarity(id)
                .map(CatalogService::toView)
                .orElseThrow(() -> new NotFoundException("Unknown card skin"));
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'theme-id:' + #id")
    public DeckThemeView themeById(UUID id) {
        return themes.findById(id)
                .map(CatalogService::toView)
                .orElseThrow(() -> new NotFoundException("Unknown deck theme"));
    }

    /** The owning theme of a skin, needed by callers that reason about theme-level ownership. */
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = "catalog", key = "'skin-theme:' + #code")
    public DeckThemeView themeOfSkin(String code) {
        return skins.findByCodeWithRarity(code)
                .map(skin -> toView(skin.getTheme()))
                .orElseThrow(() -> new NotFoundException("Unknown card skin"));
    }

    private List<CardSkinView> skinViews(UUID themeId) {
        return skins.findActiveByTheme(themeId).stream()
                .sorted(Comparator.comparing(CardSkin::getSuit).thenComparing(CardSkin::getRank))
                .map(CatalogService::toView)
                .toList();
    }

    private static CardSkinView toView(CardSkin skin) {
        return new CardSkinView(
                skin.getId(),
                skin.getCode(),
                skin.getRank(),
                skin.getSuit(),
                skin.getDisplayName(),
                skin.getImageRef(),
                skin.getRarity().getCode(),
                skin.effectiveMultiplier());
    }

    private static DeckThemeView toView(DeckTheme theme) {
        return new DeckThemeView(
                theme.getId(), theme.getCode(), theme.getName(), theme.getDescription(), theme.isDefault());
    }
}
