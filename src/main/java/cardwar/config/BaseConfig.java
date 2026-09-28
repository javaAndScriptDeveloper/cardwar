package cardwar.config;

import cardwar.engine.DurakEngine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BaseConfig {

    /**
     * The engine is a plain object with no framework knowledge, so it is wired here rather than annotated.
     * The no-argument constructor is the one that shuffles with {@code SecureRandom}; the seeded constructor
     * exists for tests only and is deliberately not reachable from configuration.
     */
    @Bean
    DurakEngine durakEngine() {
        return new DurakEngine();
    }
}
