package cardwar.account.service;

import cardwar.metrics.GameMetrics;
import cardwar.metrics.GameMetrics.SignIn;
import cardwar.security.PlayerIdentity;
import cardwar.security.PrincipalResolver;
import cardwar.security.telegram.TelegramInitDataVerifier;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The Telegram identity provider: a signed initData string in, our own player out. Implemented as a
 * {@link PrincipalResolver} because that is the seam the design reserved for it; it lives here rather than in
 * {@code security} because provisioning the account is account-module work, and {@code security} must not depend on
 * {@code account}.
 *
 * <p>It is used only to exchange initData for a JWT at {@code /api/v1/auth/telegram}. Every later request carries
 * that JWT, so the bearer filter keeps resolving JWTs and nothing downstream knows Telegram exists.
 */
@Service
public class TelegramSignInService implements PrincipalResolver {

    private final TelegramInitDataVerifier verifier;
    private final AccountService accounts;
    private final GameMetrics metrics;

    public TelegramSignInService(TelegramInitDataVerifier verifier, AccountService accounts, GameMetrics metrics) {
        this.verifier = verifier;
        this.accounts = accounts;
        this.metrics = metrics;
    }

    @Override
    public Optional<PlayerIdentity> resolve(String initData) {
        return verifier.verify(initData).map(user -> {
            PlayerIdentity identity =
                    accounts.registerTelegram(user.id(), user.displayName(), user.handle(), user.photoUrl());
            metrics.signIn(SignIn.TELEGRAM);
            return identity;
        });
    }
}
