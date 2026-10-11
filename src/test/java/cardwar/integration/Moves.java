package cardwar.integration;

import cardwar.engine.Card;
import cardwar.engine.DuelPhase;
import cardwar.engine.DurakEngine;
import cardwar.engine.DurakRules;
import cardwar.engine.Rank;
import cardwar.session.dto.DuelView;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** Move payloads, and the simple strategy tests use to play a duel to its end over the API. */
final class Moves {

    private Moves() {}

    /**
     * Attack whenever legal, otherwise end the attack. Defend the first unresolved card with the cheapest card
     * that beats it, otherwise take. Each decision uses only the acting player's own redacted view.
     */
    static Map<String, Object> next(DuelView own) {
        if (own.phase() == DuelPhase.DEFEND) {
            Card target = own.table().stream()
                    .filter(pair -> pair.defence() == null)
                    .findFirst()
                    .orElseThrow()
                    .attack();
            return own.hand().stream()
                    .filter(card -> DurakRules.beats(target, card, own.trumpSuit()))
                    .min((a, b) -> a.rank().compareTo(b.rank()))
                    .map(card -> defend(target, card))
                    .orElseGet(() -> Map.of("type", "TAKE"));
        }
        if (own.table().isEmpty()) {
            return attack(own.hand().stream()
                    .min((a, b) -> a.rank().compareTo(b.rank()))
                    .orElseThrow());
        }
        Set<Rank> ranksOnTable = own.table().stream()
                .flatMap(pair -> pair.defence() == null
                        ? Stream.of(pair.attack().rank())
                        : Stream.of(pair.attack().rank(), pair.defence().rank()))
                .collect(Collectors.toSet());
        long undefended =
                own.table().stream().filter(pair -> pair.defence() == null).count();
        boolean roomOnTable = own.table().size() < DurakEngine.MAX_ATTACK_CARDS && undefended < own.opponentHandCount();
        if (roomOnTable) {
            Optional<Card> throwIn = own.hand().stream()
                    .filter(card -> ranksOnTable.contains(card.rank()))
                    .findFirst();
            if (throwIn.isPresent()) {
                return attack(throwIn.get());
            }
        }
        return Map.of("type", "END_ATTACK");
    }

    static Map<String, Object> attack(Card card) {
        return Map.of("type", "ATTACK", "card", cardRef(card));
    }

    static Map<String, Object> defend(Card attackCard, Card defenceCard) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "DEFEND");
        payload.put("attackCard", cardRef(attackCard));
        payload.put("card", cardRef(defenceCard));
        return payload;
    }

    private static Map<String, Object> cardRef(Card card) {
        return Map.of("rank", card.rank().name(), "suit", card.suit().name());
    }
}
