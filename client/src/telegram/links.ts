export interface LinkConfig {
    botUsername?: string | undefined;
    /** A BotFather "named" Mini App; without one the bot's Main Mini App link is used. */
    appName?: string | undefined;
    origin: string;
}

/** Build-time configuration (TELEGRAM_BOT_USERNAME / TELEGRAM_APP_NAME build args, see nginx/Dockerfile). */
export function linkConfigFromEnv(origin: string): LinkConfig {
    const env = import.meta.env;
    return {
        botUsername: env.VITE_TELEGRAM_BOT_USERNAME || undefined,
        appName: env.VITE_TELEGRAM_APP_NAME || undefined,
        origin,
    };
}

/**
 * The link a friend taps. With a named Mini App, `startapp` opens the app directly and arrives as `start_param`.
 * Otherwise the link opens the bot chat with `/start <id>`, and the bot answers with a button that opens
 * `/app/?invite=<id>`: that works without a BotFather Main Mini App. Outside Telegram (no bot configured) the
 * link is the app URL itself, so the dev shim has a deep link too.
 */
export function inviteLink(inviteId: string, config: LinkConfig): string {
    const id = encodeURIComponent(inviteId);
    if (!config.botUsername) {
        return `${config.origin}/app/?invite=${id}`;
    }
    if (config.appName) {
        return `https://t.me/${config.botUsername}/${config.appName}?startapp=${id}`;
    }
    return `https://t.me/${config.botUsername}?start=${id}`;
}

export function shareUrl(link: string, text: string): string {
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}
