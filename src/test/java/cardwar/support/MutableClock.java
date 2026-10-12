package cardwar.support;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The shared test context's clock: real time until a test pins an instant, so date-sensitive rules (drop weeks,
 * the daily bonus) can be driven without booting a second Spring context. A test that pins must reset afterwards.
 */
public final class MutableClock extends Clock {

    private final AtomicReference<Instant> pinned = new AtomicReference<>();
    private final ZoneId zone;

    public MutableClock() {
        this(ZoneOffset.UTC);
    }

    private MutableClock(ZoneId zone) {
        this.zone = zone;
    }

    public void pin(Instant instant) {
        pinned.set(instant);
    }

    public void reset() {
        pinned.set(null);
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId other) {
        MutableClock copy = new MutableClock(other);
        copy.pinned.set(pinned.get());
        return copy;
    }

    @Override
    public Instant instant() {
        Instant fixed = pinned.get();
        return fixed != null ? fixed : Instant.now();
    }
}
