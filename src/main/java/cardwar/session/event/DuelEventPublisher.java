package cardwar.session.event;

import cardwar.engine.DuelId;
import cardwar.engine.GameEvent;
import cardwar.session.dto.DuelEventView;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Publishes engine events to a per-duel channel. It knows nothing about how anybody consumes them — the SSE
 * stream is one subscriber today, and a WebSocket transport can become a second one without this class
 * changing at all.
 */
@Slf4j
@Component
public class DuelEventPublisher {

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;

    public DuelEventPublisher(StringRedisTemplate redis, ObjectMapper mapper) {
        this.redis = redis;
        this.mapper = mapper;
    }

    public void publishEmote(DuelId duelId, java.util.UUID from, String emote) {
        try {
            redis.convertAndSend(
                    DuelChannels.forDuel(duelId), mapper.writeValueAsString(DuelEventView.emote(duelId, from, emote)));
        } catch (RuntimeException ex) {
            log.warn(
                    "Could not publish an emote for duel {}: {}",
                    duelId.value(),
                    ex.getClass().getSimpleName());
        }
    }

    public void publish(DuelId duelId, List<GameEvent> events) {
        String channel = DuelChannels.forDuel(duelId);
        for (GameEvent event : events) {
            try {
                redis.convertAndSend(channel, mapper.writeValueAsString(DuelEventView.of(duelId, event)));
            } catch (RuntimeException ex) {
                // A duel that cannot notify is still a duel that can be played and read; do not fail the move.
                log.warn(
                        "Could not publish an event for duel {}: {}",
                        duelId.value(),
                        ex.getClass().getSimpleName());
            }
        }
    }
}
