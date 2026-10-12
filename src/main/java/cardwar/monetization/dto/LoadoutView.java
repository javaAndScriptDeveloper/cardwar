package cardwar.monetization.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** What a player has equipped, as content refs the client resolves; emotes are all owned emotes. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoadoutView(String deck, String cardBack, String table, String frame, List<String> emotes) {}
