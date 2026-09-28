package cardwar.engine;

import java.util.Objects;

/** An attack card on the table, together with the card that beat it — {@code null} while still undefended. */
public record TablePair(Card attack, Card defence) {

    public TablePair {
        Objects.requireNonNull(attack, "attack");
    }

    public static TablePair undefended(Card attack) {
        return new TablePair(attack, null);
    }

    public boolean isDefended() {
        return defence != null;
    }

    public TablePair defendedWith(Card card) {
        return new TablePair(attack, card);
    }
}
