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
 * The link a friend taps. Telegram passes `startapp` to the Mini App as `start_param`; outside Telegram (no bot
 * configured) the app reads `?invite=` from its own URL instead, so the dev shim has a deep link too.
 */
export function inviteLink(inviteId: string, config: LinkConfig): string {
    const id = encodeURIComponent(inviteId);
    if (!config.botUsername) {
        return `${config.origin}/app/?invite=${id}`;
    }
    const app = config.appName ? `/${config.appName}` : '';
    return `https://t.me/${config.botUsername}${app}?startapp=${id}`;
}

export function shareUrl(link: string, text: string): string {
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}
