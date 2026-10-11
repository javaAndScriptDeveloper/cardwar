package cardwar.security.telegram;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Telegram Mini App sign-in. The bot token is the HMAC key Telegram signs initData with, so it is a secret on a
 * par with the JWT secret: no default, and production refuses to start without it.
 */
@ConfigurationProperties(prefix = "cardwar.security.telegram")
public record TelegramProperties(String botToken, Duration initDataMaxAge) {

    public TelegramProperties {
        initDataMaxAge = initDataMaxAge == null ? Duration.ofHours(1) : initDataMaxAge;
    }

    public boolean hasBotToken() {
        return botToken != null && !botToken.isBlank();
    }
}
