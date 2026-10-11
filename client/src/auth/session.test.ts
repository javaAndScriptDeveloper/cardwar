import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { AuthResponse } from '../api/types';
import { resolveTelegram } from '../telegram/webapp';
import { Session } from './session';

const auth = (username: string): AuthResponse => ({
    playerId: `id-${username}`,
    username,
    token: `token-${username}`,
    expiresAt: '2099-01-01T00:00:00Z',
});

const fakeApi = () => ({
    telegramSignIn: vi.fn(),
    passwordLogin: vi.fn(),
    register: vi.fn(),
});

describe('Session', () => {
    it('exchanges Telegram initData for a token held in memory', async () => {
        const api = fakeApi();
        api.telegramSignIn.mockResolvedValue(auth('tg_42'));
        const session = new Session();
        const telegram = resolveTelegram({
            Telegram: {
                WebApp: {
                    initData: 'signed',
                    initDataUnsafe: {},
                    ready: vi.fn(),
                    expand: vi.fn(),
                    openTelegramLink: vi.fn(),
                    HapticFeedback: { notificationOccurred: vi.fn(), impactOccurred: vi.fn() },
                },
            },
        });

        await session.signInWithTelegram(api, telegram);

        expect(api.telegramSignIn).toHaveBeenCalledWith('signed');
        expect(session.token()).toBe('token-tg_42');
        expect(session.player()).toEqual({ playerId: 'id-tg_42', username: 'tg_42' });
    });

    it('refuses Telegram sign-in outside Telegram', async () => {
        await expect(new Session().signInWithTelegram(fakeApi(), resolveTelegram({}))).rejects.toThrow(
            /Telegram/,
        );
    });

    it('dev shim logs in with a password', async () => {
        const api = fakeApi();
        api.passwordLogin.mockResolvedValue(auth('alice'));
        const session = new Session();

        await session.signInDev(api, 'alice', 'correct-horse-battery');

        expect(session.token()).toBe('token-alice');
        expect(api.register).not.toHaveBeenCalled();
    });

    it('dev shim registers an unknown name, so a fresh browser can sign in as anyone', async () => {
        const api = fakeApi();
        api.passwordLogin.mockRejectedValue(new ApiError(401));
        api.register.mockResolvedValue(auth('newbie'));
        const session = new Session();

        await session.signInDev(api, 'newbie', 'correct-horse-battery');

        expect(api.register).toHaveBeenCalledWith('newbie', 'correct-horse-battery');
        expect(session.token()).toBe('token-newbie');
    });

    it('dev shim surfaces other failures instead of registering', async () => {
        const api = fakeApi();
        api.passwordLogin.mockRejectedValue(new ApiError(429));
        const session = new Session();

        await expect(session.signInDev(api, 'alice', 'pw')).rejects.toMatchObject({ status: 429 });
        expect(api.register).not.toHaveBeenCalled();
        expect(session.token()).toBeUndefined();
    });
});
