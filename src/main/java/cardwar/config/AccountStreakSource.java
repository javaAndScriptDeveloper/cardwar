package cardwar.config;

import cardwar.account.service.AccountService;
import cardwar.monetization.grant.StreakSource;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The account module's streaks behind monetization's {@link StreakSource} port. Wired here rather than inside the
 * account module because monetization already depends on account; the reverse edge would close a module cycle.
 */
@Component
public class AccountStreakSource implements StreakSource {

    private final AccountService accounts;

    public AccountStreakSource(AccountService accounts) {
        this.accounts = accounts;
    }

    @Override
    public int bestWinStreak(UUID playerId) {
        return accounts.bestWinStreakOf(playerId);
    }
}
