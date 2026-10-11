package cardwar.security;

import cardwar.security.telegram.TelegramProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Fails startup in production when a signing secret is missing: the JWT secret, or the Telegram bot token that
 * initData is verified with. This exists because the failure mode it
 * prevents — quietly falling back to a generated or default secret — produces an application that looks
 * authenticated and is not.
 */
@Configuration(proxyBeanMethods = false)
@Profile("prod")
public class ProductionSecretsCheck {

    public ProductionSecretsCheck(JwtProperties properties, TelegramProperties telegram) {
        if (!properties.hasSecret()) {
            throw new IllegalStateException("JWT_SECRET must be set in the prod profile: refusing to start with "
                    + "an ephemeral signing secret, which would make every issued token unverifiable after a "
                    + "restart and every restart a silent logout.");
        }
        if (!telegram.hasBotToken()) {
            throw new IllegalStateException("TELEGRAM_BOT_TOKEN must be set in the prod profile: without it no "
                    + "Telegram sign-in can be verified, so the Mini App cannot sign anybody in.");
        }
    }
}
