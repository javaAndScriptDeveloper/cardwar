package cardwar.engine;

import java.util.Objects;

/**
 * A playing card, identified solely by rank and suit. The engine never knows which skin renders it — that
 * mapping lives in the catalog module and is applied on the way out to a client.
 */
public record Card(Rank rank, Suit suit) {

    public Card {
        Objects.requireNonNull(rank, "rank");
        Objects.requireNonNull(suit, "suit");
    }

    public boolean isTrump(Suit trumpSuit) {
        return suit == trumpSuit;
    }
}
