package cardwar.catalog.dto;

import java.util.UUID;

public record DeckThemeView(UUID id, String code, String name, String description, boolean isDefault) {}
