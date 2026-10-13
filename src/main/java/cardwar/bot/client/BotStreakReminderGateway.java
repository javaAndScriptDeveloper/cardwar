package cardwar.bot.client;

import cardwar.account.service.AccountService;
import cardwar.bot.service.TelegramBotService;
import cardwar.wallet.notify.StreakReminderGateway;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Streak reminders as Telegram DMs; the wallet sees only the port. The chat id is the player's Telegram user id,
 * looked up here because the wallet cannot ask the account module itself without a dependency cycle.
 */
@Component
public class BotStreakReminderGateway implements StreakReminderGateway {

    private final AccountService accounts;
    private final TelegramBotService bot;

    public BotStreakReminderGateway(AccountService accounts, TelegramBotService bot) {
        this.accounts = accounts;
        this.bot = bot;
    }

    @Override
    public void remindStreak(UUID playerId, int streakDays) {
        accounts.telegramUserIdOf(playerId).ifPresent(chat -> bot.notifyStreak(chat, streakDays));
    }
}
