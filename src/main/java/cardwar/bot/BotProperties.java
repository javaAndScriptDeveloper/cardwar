package cardwar.bot;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the bot points people and where it talks to Telegram. The bot token itself is the sign-in secret and stays
 * in {@link cardwar.security.telegram.TelegramProperties}.
 *
 * @param miniAppUrl the public URL of the Mini App, which the bot's buttons open
 * @param apiUrl the Bot API base; overridable so tests never reach Telegram
 */
@ConfigurationProperties(prefix = "cardwar.bot")
public record BotProperties(String miniAppUrl, String apiUrl) {}
