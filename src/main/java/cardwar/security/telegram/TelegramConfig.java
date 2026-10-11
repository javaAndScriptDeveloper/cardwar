package cardwar.security.telegram;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The verifier is a plain object so it can be unit-tested with a fixed clock; it is wired here. */
@Configuration(proxyBeanMethods = false)
public class TelegramConfig {

    @Bean
    TelegramInitDataVerifier telegramInitDataVerifier(TelegramProperties properties) {
        return new TelegramInitDataVerifier(properties.botToken(), properties.initDataMaxAge(), Clock.systemUTC());
    }
}
