package cardwar.session.event;

import cardwar.engine.DuelId;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Holds the open server-sent-events streams and feeds them from the Redis channel. Subscribing through Redis
 * rather than dispatching in-process is what lets a second application instance serve the other player.
 *
 * <p>No redaction happens here, and that is deliberate rather than an omission: engine events carry only public
 * facts, so a single serialized event is safe for both participants. Anything private would have to be added
 * to {@code DuelEventView} first, and that type is where the rule is documented and tested.
 *
 * <p>A stream also gets a periodic comment while nothing happens. Proxies, browsers and mobile networks drop an
 * idle connection silently, and the player would then miss the opponent's next move; a comment is invisible to
 * SSE clients but keeps every hop convinced the connection is alive.
 */
@Slf4j
@Component
public class DuelStreams implements MessageListener {

    private final Map<UUID, Map<UUID, SseEmitter>> byDuel = new ConcurrentHashMap<>();
    private final DuelStreamProperties properties;
    private final ScheduledExecutorService heartbeat;

    public DuelStreams(DuelStreamProperties properties) {
        this.properties = properties;
        // A daemon thread, so a stuck emitter can never keep the JVM from exiting.
        this.heartbeat = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "duel-stream-heartbeat");
            thread.setDaemon(true);
            return thread;
        });
        long period = properties.heartbeat().toMillis();
        heartbeat.scheduleAtFixedRate(this::sendKeepalives, period, period, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void shutdown() {
        heartbeat.shutdownNow();
    }

    public SseEmitter open(DuelId duelId, UUID subscriber) {
        var emitter = new SseEmitter(properties.timeout().toMillis());
        UUID duel = duelId.value();
        UUID registration = UUID.randomUUID();
        byDuel.computeIfAbsent(duel, ignored -> new ConcurrentHashMap<>()).put(registration, emitter);
        emitter.onCompletion(() -> remove(duel, registration));
        emitter.onTimeout(() -> remove(duel, registration));
        emitter.onError(ignored -> remove(duel, registration));
        log.debug("Opened an event stream for duel {}", duel);
        return emitter;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String channel = new String(message.getChannel());
        String payload = new String(message.getBody());
        UUID duel = duelOf(channel);
        if (duel == null) {
            return;
        }
        Map<UUID, SseEmitter> emitters = byDuel.get(duel);
        if (emitters == null) {
            return;
        }
        emitters.forEach((registration, emitter) -> {
            try {
                emitter.send(SseEmitter.event().name("duel").data(payload));
            } catch (IOException | IllegalStateException disconnected) {
                remove(duel, registration);
            }
        });
    }

    private void sendKeepalives() {
        byDuel.forEach((duel, emitters) -> emitters.forEach((registration, emitter) -> {
            try {
                emitter.send(SseEmitter.event().comment("keepalive"));
            } catch (IOException | IllegalStateException disconnected) {
                remove(duel, registration);
            }
        }));
    }

    private void remove(UUID duel, UUID registration) {
        Map<UUID, SseEmitter> emitters = byDuel.get(duel);
        if (emitters == null) {
            return;
        }
        emitters.remove(registration);
        if (emitters.isEmpty()) {
            byDuel.remove(duel, emitters);
        }
    }

    /** Channel names are {@code cardwar:duel:{uuid}:events}; anything else is not ours. */
    private static UUID duelOf(String channel) {
        String[] parts = channel.split(":");
        if (parts.length != 4) {
            return null;
        }
        try {
            return UUID.fromString(parts[2]);
        } catch (IllegalArgumentException notAUuid) {
            return null;
        }
    }
}
