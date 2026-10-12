package cardwar.session.policy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * At most one challenge message per challenger and friend per window: the bot DMs people, and a button pressed in a
 * loop must not turn it into a spammer (which would also get the bot reported). One app instance, so in memory.
 */
public class ChallengeCooldown {

    private final Clock clock;
    private final Duration window;
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();

    public ChallengeCooldown(Clock clock, Duration window) {
        this.clock = clock;
        this.window = window;
    }

    public boolean allow(UUID challenger, UUID friend) {
        Instant now = clock.instant();
        String pair = challenger + ">" + friend;
        boolean[] allowed = {false};
        lastSent.compute(pair, (key, previous) -> {
            if (previous == null || !previous.plus(window).isAfter(now)) {
                allowed[0] = true;
                return now;
            }
            return previous;
        });
        return allowed[0];
    }
}
