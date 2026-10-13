/**
 * The slice of Telegram's Mini App SDK (https://core.telegram.org/bots/webapps) this app uses, behind one small
 * interface so components never touch `window.Telegram` and tests can hand in a fake.
 */

/** The SDK object as `telegram-web-app.js` installs it; only the members we call are typed. */
export interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
        start_param?: string;
        user?: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string };
    };
    colorScheme: 'light' | 'dark';
    ready(): void;
    expand(): void;
    setHeaderColor(color: string): void;
    setBackgroundColor(color: string): void;
    openTelegramLink(url: string): void;
    openInvoice(url: string, callback?: (status: InvoiceStatus) => void): void;
    HapticFeedback: {
        notificationOccurred(type: 'error' | 'success' | 'warning'): void;
        impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    };
    BackButton: {
        show(): void;
        hide(): void;
        onClick(callback: () => void): void;
        offClick(callback: () => void): void;
    };
}

/** The Telegram account behind the session, as the SDK reports it (unsigned; the server trusts only initData). */
export interface TelegramUser {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
    photoUrl?: string;
}

/** The app's ink background (kit/tokens.css --ink); Telegram paints its header and body in it so the chrome matches. */
export const BRAND_INK = '#0b0d12';

/** How an invoice ended, as Telegram reports it; 'pending' also when the shim opened it in a tab. */
export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

export type HapticKind = 'success' | 'error' | 'warning' | 'tap';

export interface Telegram {
    /** True only inside a Telegram client, where initData is signed and the server will accept it. */
    readonly inTelegram: boolean;
    /** Signed initData, the credential exchanged for our token. Empty in the dev shim. */
    readonly initData: string;
    /** The `startapp` deep-link parameter: an invite id when a friend's link opened the app. */
    readonly startParam: string | undefined;
    /** Who opened the app, for the avatar and greeting; undefined in the dev shim. */
    readonly user: TelegramUser | undefined;
    readonly colorScheme: 'light' | 'dark';
    ready(): void;
    haptic(kind: HapticKind): void;
    openTelegramLink(url: string): void;
    /** Opens a Stars invoice link; `onStatus` hears once how it ended. */
    openInvoice(url: string, onStatus: (status: InvoiceStatus) => void): void;
    /** Shows Telegram's own back button wired to `onClick`, or hides it (and unwires the last handler). */
    backButton(visible: boolean, onClick?: () => void): void;
}

/** Just what `resolveTelegram` reads from `window`, so tests can pass a plain object. */
export interface TelegramHost {
    Telegram?: { WebApp?: TelegramWebApp };
    open?: (url: string, target: string) => unknown;
    matchMedia?: (query: string) => { matches: boolean };
}

/**
 * The SDK script also loads in a plain browser, where it reports empty initData. Treating that as "not in Telegram"
 * is what lets the same build run in a browser with the password-login dev shim.
 */
export function resolveTelegram(host: TelegramHost): Telegram {
    const webApp = host.Telegram?.WebApp;
    if (webApp && webApp.initData) {
        let backHandler: (() => void) | undefined;
        const user = webApp.initDataUnsafe.user;
        return {
            inTelegram: true,
            initData: webApp.initData,
            startParam: webApp.initDataUnsafe.start_param,
            user: user && {
                id: user.id,
                firstName: user.first_name,
                ...(user.last_name !== undefined && { lastName: user.last_name }),
                ...(user.username !== undefined && { username: user.username }),
                ...(user.photo_url !== undefined && { photoUrl: user.photo_url }),
            },
            colorScheme: webApp.colorScheme,
            ready() {
                webApp.ready();
                webApp.expand();
                webApp.setHeaderColor(BRAND_INK);
                webApp.setBackgroundColor(BRAND_INK);
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
            openInvoice(url, onStatus) {
                webApp.openInvoice(url, onStatus);
            },
            backButton(visible, onClick) {
                if (backHandler) {
                    webApp.BackButton.offClick(backHandler);
                    backHandler = undefined;
                }
                if (visible && onClick) {
                    backHandler = onClick;
                    webApp.BackButton.onClick(onClick);
                    webApp.BackButton.show();
                } else {
                    webApp.BackButton.hide();
                }
            },
        };
    }
    return {
        inTelegram: false,
        initData: '',
        startParam: undefined,
        user: undefined,
        colorScheme: host.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        ready() {},
        haptic() {},
        openTelegramLink(url) {
            host.open?.(url, '_blank');
        },
        // A browser cannot pay in Stars and never learns the outcome; the wallet refreshes on the next screen change.
        openInvoice(url, onStatus) {
            host.open?.(url, '_blank');
            onStatus('pending');
        },
        backButton() {},
    };
}
