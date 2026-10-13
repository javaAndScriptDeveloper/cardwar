import { describe, expect, it, vi } from 'vitest';
import { resolveTelegram } from './webapp';

const telegramWebApp = (initData: string, startParam?: string) => ({
    initData,
    initDataUnsafe: startParam === undefined ? {} : { start_param: startParam },
    colorScheme: 'light' as const,
    ready: vi.fn(),
    expand: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    openTelegramLink: vi.fn(),
    openInvoice: vi.fn(),
    HapticFeedback: { notificationOccurred: vi.fn(), impactOccurred: vi.fn() },
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
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

    it('paints the Telegram header and background in the brand ink so the chrome matches the app', () => {
        const webApp = telegramWebApp('query_id=1&hash=abc');

        resolveTelegram({ Telegram: { WebApp: webApp } }).ready();

        expect(webApp.setHeaderColor).toHaveBeenCalledWith('#0b0d12');
        expect(webApp.setBackgroundColor).toHaveBeenCalledWith('#0b0d12');
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

    it('opens invoices through Telegram and reports their status', () => {
        const webApp = telegramWebApp('x=1');
        const onStatus = vi.fn();
        resolveTelegram({ Telegram: { WebApp: webApp } }).openInvoice('https://t.me/$abc', onStatus);

        expect(webApp.openInvoice).toHaveBeenCalledWith('https://t.me/$abc', expect.any(Function));
        const callback = webApp.openInvoice.mock.calls[0]?.[1] as (status: string) => void;
        callback('paid');
        expect(onStatus).toHaveBeenCalledWith('paid');
    });

    it('opens an invoice in a new tab in the shim and reports it pending', () => {
        const open = vi.fn();
        const onStatus = vi.fn();
        resolveTelegram({ open }).openInvoice('https://t.me/$abc', onStatus);

        expect(open).toHaveBeenCalledWith('https://t.me/$abc', '_blank');
        expect(onStatus).toHaveBeenCalledWith('pending');
    });

    it('exposes the user, the colour scheme and drives the BackButton inside Telegram', () => {
        const webApp = {
            ...telegramWebApp('x=1'),
            initDataUnsafe: { user: { id: 7, first_name: 'Оля', photo_url: 'https://p/x.jpg' } },
            colorScheme: 'dark' as const,
        };
        const telegram = resolveTelegram({ Telegram: { WebApp: webApp } });

        expect(telegram.user).toEqual({ id: 7, firstName: 'Оля', photoUrl: 'https://p/x.jpg' });
        expect(telegram.colorScheme).toBe('dark');

        const handler = vi.fn();
        telegram.backButton(true, handler);
        expect(webApp.BackButton.show).toHaveBeenCalled();
        expect(webApp.BackButton.onClick).toHaveBeenCalledWith(handler);
        telegram.backButton(false);
        expect(webApp.BackButton.hide).toHaveBeenCalled();
        expect(webApp.BackButton.offClick).toHaveBeenCalledWith(handler);
    });

    it('has no user and a no-op BackButton outside Telegram', () => {
        const telegram = resolveTelegram({});

        expect(telegram.user).toBeUndefined();
        expect(telegram.colorScheme).toBe('light');
        expect(() => telegram.backButton(true, () => {})).not.toThrow();
    });
});
