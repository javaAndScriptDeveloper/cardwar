package cardwar.monetization;

import cardwar.monetization.grant.StreakSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Fallback;

/** Defaults for the ports monetization consumes from other modules. */
@Configuration(proxyBeanMethods = false)
public class MonetizationConfig {

    /**
     * Until the account module supplies a real streak, nobody has one. {@code @Fallback} backs the condition up:
     * the condition is evaluated in configuration-class order, so if the account bean's class is parsed later this
     * one still yields to it instead of making the injection ambiguous.
     */
    @Bean
    @Fallback
    @ConditionalOnMissingBean(StreakSource.class)
    StreakSource noStreaks() {
        return playerId -> 0;
    }
}
