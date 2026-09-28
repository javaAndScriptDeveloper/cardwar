package cardwar.session.dto;

import cardwar.engine.Card;
import cardwar.engine.TablePair;
import com.fasterxml.jackson.annotation.JsonInclude;

/** An attack on the table and the card that beat it, if any. Everything here is public to both players. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TablePairView(Card attack, Card defence) {

    public static TablePairView of(TablePair pair) {
        return new TablePairView(pair.attack(), pair.defence());
    }
}
