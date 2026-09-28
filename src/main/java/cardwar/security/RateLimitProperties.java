package cardwar.security;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Token-bucket sizing. Authentication endpoints get their own, much smaller bucket: they are the ones worth
 * hammering, and they are reachable without a credential.
 */
@ConfigurationProperties(prefix = "cardwar.security.rate-limit")
public record RateLimitProperties(long capacity, Duration refillPeriod, long authCapacity, Duration authRefillPeriod) {

    public RateLimitProperties {
        capacity = capacity <= 0 ? 120 : capacity;
        authCapacity = authCapacity <= 0 ? 10 : authCapacity;
        refillPeriod = refillPeriod == null ? Duration.ofMinutes(1) : refillPeriod;
        authRefillPeriod = authRefillPeriod == null ? Duration.ofMinutes(1) : authRefillPeriod;
    }
}
