package cardwar.session.event;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Timing of a duel event stream. The heartbeat is well under the idle timeouts of common proxies and mobile
 * networks, which drop a silent connection without telling either end; the emitter timeout bounds how long
 * a stream nobody reads from stays registered.
 */
@ConfigurationProperties(prefix = "cardwar.duel.stream")
public record DuelStreamProperties(Duration heartbeat, Duration timeout) {

    public DuelStreamProperties {
        heartbeat = heartbeat == null ? Duration.ofSeconds(20) : heartbeat;
        timeout = timeout == null ? Duration.ofMinutes(30) : timeout;
    }
}
