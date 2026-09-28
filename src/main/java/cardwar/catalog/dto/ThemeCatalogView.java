package cardwar.catalog.dto;

import java.util.List;

/** A theme together with its full rank-and-suit-to-skin mapping. */
public record ThemeCatalogView(DeckThemeView theme, List<CardSkinView> skins) {}
