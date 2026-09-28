package cardwar.engine;

import java.util.List;
import java.util.Objects;

/**
 * The complete state of one duel. Immutable: the engine returns a new instance rather than mutating this one,
 * which is what lets the state be a plain document in the state store with no second in-memory source of truth.
 *
 * <p>Hands are held as two explicit lists rather than a map keyed by player, so the state serializes to plain
 * JSON without a key serializer. {@code outcome} is {@code null} until the duel finishes.
 *
 * <p>The talon is drawn from the front; the revealed trump card is its last element and is therefore the last
 * card handed out.
 */
public record DuelState(
        DuelId duelId,
        PlayerId playerA,
        PlayerId playerB,
        List<Card> handA,
        List<Card> handB,
        List<Card> talon,
        Card trumpCard,
        Suit trumpSuit,
        List<TablePair> table,
        List<Card> discard,
        PlayerId attackerId,
        DuelPhase phase,
        Outcome outcome,
        long version) {

    public DuelState {
        Objects.requireNonNull(duelId, "duelId");
        Objects.requireNonNull(playerA, "playerA");
        Objects.requireNonNull(playerB, "playerB");
        Objects.requireNonNull(trumpCard, "trumpCard");
        Objects.requireNonNull(trumpSuit, "trumpSuit");
        Objects.requireNonNull(attackerId, "attackerId");
        Objects.requireNonNull(phase, "phase");
        handA = List.copyOf(handA);
        handB = List.copyOf(handB);
        talon = List.copyOf(talon);
        table = List.copyOf(table);
        discard = List.copyOf(discard);
    }

    public boolean hasParticipant(PlayerId player) {
        return playerA.equals(player) || playerB.equals(player);
    }

    public PlayerId defenderId() {
        return opponentOf(attackerId);
    }

    public PlayerId opponentOf(PlayerId player) {
        if (playerA.equals(player)) {
            return playerB;
        }
        if (playerB.equals(player)) {
            return playerA;
        }
        throw new IllegalArgumentException("player is not a participant of this duel");
    }

    public List<Card> handOf(PlayerId player) {
        if (playerA.equals(player)) {
            return handA;
        }
        if (playerB.equals(player)) {
            return handB;
        }
        throw new IllegalArgumentException("player is not a participant of this duel");
    }

    public boolean isFinished() {
        return phase == DuelPhase.FINISHED;
    }

    public int undefendedCount() {
        return (int) table.stream().filter(pair -> !pair.isDefended()).count();
    }
}
