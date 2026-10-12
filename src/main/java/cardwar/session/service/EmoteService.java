package cardwar.session.service;

import cardwar.engine.DuelId;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.monetization.service.ShopService;
import cardwar.session.event.DuelEventPublisher;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/** Emotes thrown at the table: participants only, owned emotes only, at most one per player every 3 seconds. */
@Service
public class EmoteService {

    static final Duration MIN_INTERVAL = Duration.ofSeconds(3);

    private final DuelService duels;
    private final ShopService shop;
    private final DuelEventPublisher publisher;
    private final Clock clock;
    private final Map<UUID, Instant> lastSent = new ConcurrentHashMap<>();

    public EmoteService(DuelService duels, ShopService shop, DuelEventPublisher publisher, Clock clock) {
        this.duels = duels;
        this.shop = shop;
        this.publisher = publisher;
        this.clock = clock;
    }

    public void send(UUID duelId, PlayerId caller, String code) {
        DuelId duel = duels.requireParticipant(duelId, caller);
        String emote = shop.ownedEmote(caller.value(), code)
                .orElseThrow(() -> new BadRequestException("You do not own this emote", "NOT_OWNED"));
        Instant now = clock.instant();
        Instant previous = lastSent.get(caller.value());
        if (previous != null && previous.plus(MIN_INTERVAL).isAfter(now)) {
            throw new BadRequestException("One emote every few seconds", "EMOTE_TOO_FAST");
        }
        lastSent.put(caller.value(), now);
        publisher.publishEmote(duel, caller.value(), emote);
    }
}
