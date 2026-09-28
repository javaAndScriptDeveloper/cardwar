package cardwar.catalog.controller;

import cardwar.catalog.dto.DeckThemeView;
import cardwar.catalog.dto.ThemeCatalogView;
import cardwar.catalog.service.CatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
@Validated
@Tag(name = "Catalog", description = "Deck themes, card skins, rarities and multipliers")
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/themes")
    @Operation(summary = "List the active deck themes")
    public List<DeckThemeView> themes() {
        return catalog.listThemes();
    }

    @GetMapping("/themes/default")
    @Operation(summary = "The default theme and its full card mapping")
    public ThemeCatalogView defaultTheme() {
        return catalog.defaultTheme();
    }

    @GetMapping("/themes/{code}")
    @Operation(summary = "One theme and its rank/suit to skin mapping")
    public ThemeCatalogView theme(@PathVariable @NotBlank @Size(max = 64) String code) {
        return catalog.themeByCode(code);
    }
}
