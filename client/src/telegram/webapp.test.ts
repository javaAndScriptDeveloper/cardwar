import { describe, expect, it, vi } from 'vitest';
import { resolveTelegram } from './webapp';

const telegramWebApp = (initData: string, startParam?: string) => ({
    initData,
    initDataUnsafe: startParam === undefined ? {} : { start_param: startParam },
    ready: vi.fn(),
    expand: vi.fn(),
    openTelegramLink: vi.fn(),
    HapticFeedback: { notificationOccurred: vi.fn(), impactOccurred: vi.fn() },
});

describe('resolveTelegram', () => {
    it('uses the real WebApp when Telegram supplied initData', () => {
        const webApp = telegramWebApp('query_id=1&hash=abc', 'invite-1');

        const telegram = resolveTelegram({ Telegram: { WebApp: webApp } });

        expect(telegram.inTelegram).toBe(true);
        expect(telegram.initData).toBe('query_id=1&hash=abc');
        expect(telegram.startParam).toBe('invite-1');
        telegram.ready();
        expect(webApp.ready).toHaveBeenCalled();
        expect(webApp.expand).toHaveBeenCalled();
    });

    it('falls back to the dev shim in a plain browser, where the SDK loads with empty initData', () => {
        const telegram = resolveTelegram({ Telegram: { WebApp: telegramWebApp('') } });

        expect(telegram.inTelegram).toBe(false);
        expect(telegram.initData).toBe('');
        expect(telegram.startParam).toBeUndefined();
    });

    it('falls back to the dev shim when the SDK did not load at all', () => {
        const telegram = resolveTelegram({});

        expect(telegram.inTelegram).toBe(false);
        expect(() => telegram.ready()).not.toThrow();
        expect(() => telegram.haptic('success')).not.toThrow();
    });

    it('routes haptics to the WebApp in Telegram', () => {
        const webApp = telegramWebApp('x=1');

        resolveTelegram({ Telegram: { WebApp: webApp } }).haptic('error');

        expect(webApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith('error');
    });

    it('opens share links through Telegram, and in a new tab in the shim', () => {
        const webApp = telegramWebApp('x=1');
        resolveTelegram({ Telegram: { WebApp: webApp } }).openTelegramLink('https://t.me/share/url?url=x');
        expect(webApp.openTelegramLink).toHaveBeenCalledWith('https://t.me/share/url?url=x');

        const open = vi.fn();
        resolveTelegram({ open }).openTelegramLink('https://t.me/share/url?url=x');
        expect(open).toHaveBeenCalledWith('https://t.me/share/url?url=x', '_blank');
    });
});
