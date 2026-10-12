package cardwar.session.dto;

import cardwar.engine.Card;
import cardwar.engine.DuelId;
import cardwar.engine.GameEvent;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

/**
 * An engine event on the wire. Flat and explicitly typed rather than polymorphic, which keeps Jackson
 * annotations out of the engine and keeps the published JSON stable for clients.
 *
 * <p>Every field here is a public fact. Engine events never name a card that is in somebody's hand — only cards
 * that reached the table, and counts for anything private — so one serialized event can be fanned out to both
 * participants without per-recipient redaction.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DuelEventView(
        String type,
        UUID duelId,
        UUID player,
        Card card,
        Card attackCard,
        Card defenceCard,
        Card trumpCard,
        Integer cardCount,
        Integer talonRemaining,
        Boolean defenceSucceeded,
        UUID nextAttacker,
        OutcomeView outcome,
        String emote) {

    /** An emote thrown at the table: who sent it and which one. Not an engine event; only the table shows it. */
    public static DuelEventView emote(DuelId duelId, UUID from, String emote) {
        return new DuelEventView(
                "EMOTE", duelId.value(), from, null, null, null, null, null, null, null, null, null, emote);
    }

    public static DuelEventView of(DuelId duelId, GameEvent event) {
        UUID id = duelId.value();
        return switch (event) {
            case GameEvent.DuelStarted e ->
                builder("DUEL_STARTED", id)
                        .player(e.attacker().value())
                        .nextAttacker(e.attacker().value())
                        .trumpCard(e.trumpCard())
                        .build();
            case GameEvent.CardPlayed e ->
                builder("CARD_PLAYED", id)
                        .player(e.attacker().value())
                        .card(e.card())
                        .build();
            case GameEvent.CardDefended e ->
                builder("CARD_DEFENDED", id)
                        .player(e.defender().value())
                        .attackCard(e.attackCard())
                        .defenceCard(e.defenceCard())
                        .build();
            case GameEvent.CardsTaken e ->
                builder("CARDS_TAKEN", id)
                        .player(e.defender().value())
                        .cardCount(e.cardCount())
                        .build();
            case GameEvent.CardsDealt e ->
                builder("CARDS_DEALT", id)
                        .player(e.player().value())
                        .cardCount(e.cardCount())
                        .talonRemaining(e.talonRemaining())
                        .build();
            case GameEvent.RoundEnded e ->
                builder("ROUND_ENDED", id)
                        .nextAttacker(e.nextAttacker().value())
                        .defenceSucceeded(e.defenceSucceeded())
                        .build();
            case GameEvent.DuelFinished e ->
                builder("DUEL_FINISHED", id)
                        .outcome(OutcomeView.of(e.outcome()))
                        .build();
        };
    }

    private static Builder builder(String type, UUID duelId) {
        return new Builder(type, duelId);
    }

    /** A small mutable builder, only because a fourteen-argument constructor call is unreadable. */
    private static final class Builder {
        private final String type;
        private final UUID duelId;
        private UUID player;
        private Card card;
        private Card attackCard;
        private Card defenceCard;
        private Card trumpCard;
        private Integer cardCount;
        private Integer talonRemaining;
        private Boolean defenceSucceeded;
        private UUID nextAttacker;
        private OutcomeView outcome;

        private Builder(String type, UUID duelId) {
            this.type = type;
            this.duelId = duelId;
        }

        Builder player(UUID value) {
            this.player = value;
            return this;
        }

        Builder card(Card value) {
            this.card = value;
            return this;
        }

        Builder attackCard(Card value) {
            this.attackCard = value;
            return this;
        }

        Builder defenceCard(Card value) {
            this.defenceCard = value;
            return this;
        }

        Builder trumpCard(Card value) {
            this.trumpCard = value;
            return this;
        }

        Builder cardCount(Integer value) {
            this.cardCount = value;
            return this;
        }

        Builder talonRemaining(Integer value) {
            this.talonRemaining = value;
            return this;
        }

        Builder defenceSucceeded(Boolean value) {
            this.defenceSucceeded = value;
            return this;
        }

        Builder nextAttacker(UUID value) {
            this.nextAttacker = value;
            return this;
        }

        Builder outcome(OutcomeView value) {
            this.outcome = value;
            return this;
        }

        DuelEventView build() {
            return new DuelEventView(
                    type,
                    duelId,
                    player,
                    card,
                    attackCard,
                    defenceCard,
                    trumpCard,
                    cardCount,
                    talonRemaining,
                    defenceSucceeded,
                    nextAttacker,
                    outcome,
                    null);
        }
    }
}
