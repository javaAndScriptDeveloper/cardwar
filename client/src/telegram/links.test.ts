import { describe, expect, it } from 'vitest';
import { inviteLink, shareUrl } from './links';

describe('inviteLink', () => {
    it('links to the bot chat when only the bot is known; its /start reply opens the app', () => {
        expect(inviteLink('abc-1', { botUsername: 'cardwar_gaming_bot', origin: 'https://x' })).toBe(
            'https://t.me/cardwar_gaming_bot?start=abc-1',
        );
    });

    it('uses the named app link when an app name is configured', () => {
        expect(inviteLink('abc-1', { botUsername: 'b', appName: 'play', origin: 'https://x' })).toBe(
            'https://t.me/b/play?startapp=abc-1',
        );
    });

    it('falls back to a browser link for the dev shim', () => {
        expect(inviteLink('abc-1', { origin: 'http://localhost:5173' })).toBe(
            'http://localhost:5173/app/?invite=abc-1',
        );
    });
});

describe('shareUrl', () => {
    it('wraps the link in Telegram share with an encoded text', () => {
        expect(shareUrl('https://t.me/b?startapp=1', 'Play me')).toBe(
            'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fb%3Fstartapp%3D1&text=Play%20me',
        );
    });
});
