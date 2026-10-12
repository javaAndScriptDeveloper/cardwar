package cardwar.session.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** At most one challenge DM per challenger and friend per minute, however often the button is pressed. */
class ChallengeCooldownTest {

    private final UUID alice = UUID.randomUUID();
    private final UUID bob = UUID.randomUUID();
    private final UUID carol = UUID.randomUUID();

    private static Clock at(Instant instant) {
        return Clock.fixed(instant, ZoneOffset.UTC);
    }

    @Test
    void aSecondDmToTheSameFriendWithinTheCooldownIsHeldBack() {
        Instant start = Instant.parse("2026-10-12T10:00:00Z");
        var clock = new MutableClock(start);
        var cooldown = new ChallengeCooldown(clock, Duration.ofMinutes(1));

        assertThat(cooldown.allow(alice, bob)).isTrue();
        assertThat(cooldown.allow(alice, bob)).isFalse();
        assertThat(cooldown.allow(alice, carol)).isTrue();
        assertThat(cooldown.allow(bob, alice)).isTrue();

        clock.now = start.plusSeconds(61);
        assertThat(cooldown.allow(alice, bob)).isTrue();
    }

    static final class MutableClock extends Clock {
        Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
