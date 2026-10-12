package cardwar.engine;

import java.util.Objects;

/**
 * How a duel ended. In a draw both {@code winner} and {@code loser} are {@code null}; otherwise both are set —
 * the loser is the <em>durak</em>, the player left holding cards.
 */
public record Outcome(PlayerId winner, PlayerId loser, boolean draw, EndReason reason) {

    public Outcome {
        Objects.requireNonNull(reason, "reason");
        if (draw && (winner != null || loser != null)) {
            throw new IllegalArgumentException("a draw has neither a winner nor a loser");
        }
        if (!draw && (winner == null || loser == null)) {
            throw new IllegalArgumentException("a decided duel has both a winner and a loser");
        }
    }

    public static Outcome decided(PlayerId winner, PlayerId loser) {
        return new Outcome(winner, loser, false, EndReason.OPPONENT_OUT_OF_CARDS);
    }

    public static Outcome forfeited(PlayerId winner, PlayerId loser) {
        return new Outcome(winner, loser, false, EndReason.FORFEIT);
    }

    public static Outcome drawn() {
        return new Outcome(null, null, true, EndReason.DRAW);
    }
}
