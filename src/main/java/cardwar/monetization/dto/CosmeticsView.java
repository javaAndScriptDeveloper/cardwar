package cardwar.monetization.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/** The part of a player's loadout their opponent sees at the table. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CosmeticsView(String cardBack, String frame) {}
