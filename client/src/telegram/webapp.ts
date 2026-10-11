/**
 * The slice of Telegram's Mini App SDK (https://core.telegram.org/bots/webapps) this app uses, behind one small
 * interface so components never touch `window.Telegram` and tests can hand in a fake.
 */

/** The SDK object as `telegram-web-app.js` installs it; only the members we call are typed. */
export interface TelegramWebApp {
    initData: string;
    initDataUnsafe: { start_param?: string };
    ready(): void;
    expand(): void;
    openTelegramLink(url: string): void;
    HapticFeedback: {
        notificationOccurred(type: 'error' | 'success' | 'warning'): void;
        impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    };
}

export type HapticKind = 'success' | 'error' | 'tap';

export interface Telegram {
    /** True only inside a Telegram client, where initData is signed and the server will accept it. */
    readonly inTelegram: boolean;
    /** Signed initData, the credential exchanged for our token. Empty in the dev shim. */
    readonly initData: string;
    /** The `startapp` deep-link parameter: an invite id when a friend's link opened the app. */
    readonly startParam: string | undefined;
    ready(): void;
    haptic(kind: HapticKind): void;
    openTelegramLink(url: string): void;
}

/** Just what `resolveTelegram` reads from `window`, so tests can pass a plain object. */
export interface TelegramHost {
    Telegram?: { WebApp?: TelegramWebApp };
    open?: (url: string, target: string) => unknown;
}

/**
 * The SDK script also loads in a plain browser, where it reports empty initData. Treating that as "not in Telegram"
 * is what lets the same build run in a browser with the password-login dev shim.
 */
export function resolveTelegram(host: TelegramHost): Telegram {
    const webApp = host.Telegram?.WebApp;
    if (webApp && webApp.initData) {
        return {
            inTelegram: true,
            initData: webApp.initData,
            startParam: webApp.initDataUnsafe.start_param,
            ready() {
                webApp.ready();
                webApp.expand();
            },
            haptic(kind) {
                if (kind === 'tap') {
                    webApp.HapticFeedback.impactOccurred('light');
                } else {
                    webApp.HapticFeedback.notificationOccurred(kind);
                }
            },
            openTelegramLink(url) {
                webApp.openTelegramLink(url);
            },
        };
    }
    return {
        inTelegram: false,
        initData: '',
        startParam: undefined,
        ready() {},
        haptic() {},
        openTelegramLink(url) {
            host.open?.(url, '_blank');
        },
    };
}
