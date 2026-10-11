/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Bot username for invite links, from the TELEGRAM_BOT_USERNAME build arg. Empty in dev. */
    readonly VITE_TELEGRAM_BOT_USERNAME?: string;
    /** Optional BotFather named Mini App, from TELEGRAM_APP_NAME. */
    readonly VITE_TELEGRAM_APP_NAME?: string;
}
