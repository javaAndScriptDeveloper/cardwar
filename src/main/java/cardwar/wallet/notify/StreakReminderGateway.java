package cardwar.wallet.notify;

import java.util.UUID;

/**
 * How the wallet tells a player their bonus streak is about to lapse: a Telegram DM in production. An interface here
 * so the wallet never depends on the bot module (which implements it), the same way payments reach the Bot API. It
 * takes the player id rather than a chat id because only the account module knows the mapping, and the wallet cannot
 * call the account module without closing a dependency cycle.
 */
public interface StreakReminderGateway {

    /** Best effort; never throws. A player without a Telegram chat is simply not reachable. */
    void remindStreak(UUID playerId, int streakDays);
}
