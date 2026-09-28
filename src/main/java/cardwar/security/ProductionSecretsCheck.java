package cardwar.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Fails startup in production when the signing secret is missing. This exists because the failure mode it
 * prevents — quietly falling back to a generated or default secret — produces an application that looks
 * authenticated and is not.
 */
@Configuration(proxyBeanMethods = false)
@Profile("prod")
public class ProductionSecretsCheck {

    public ProductionSecretsCheck(JwtProperties properties) {
        if (!properties.hasSecret()) {
            throw new IllegalStateException("JWT_SECRET must be set in the prod profile: refusing to start with "
                    + "an ephemeral signing secret, which would make every issued token unverifiable after a "
                    + "restart and every restart a silent logout.");
        }
    }
}
