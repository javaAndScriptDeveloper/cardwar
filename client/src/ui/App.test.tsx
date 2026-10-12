import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { t } from '../i18n';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { Session } from '../auth/session';
import { resolveTelegram, type TelegramWebApp } from '../telegram/webapp';
import { App } from './App';

const webApp = (initData: string): TelegramWebApp => ({
    initData,
    initDataUnsafe: {},
    colorScheme: 'light',
    ready: vi.fn(),
    expand: vi.fn(),
    openTelegramLink: vi.fn(),
    HapticFeedback: { notificationOccurred: vi.fn(), impactOccurred: vi.fn() },
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
});

const authFor = (username: string) => ({ playerId: `id-${username}`, username, token: 't', expiresAt: 'x' });

function fakeApi() {
    return {
        telegramSignIn: vi.fn(),
        passwordLogin: vi.fn(),
        register: vi.fn(),
    };
}

describe('App sign-in', () => {
    it('shows the dev shim login outside Telegram and signs in with it', async () => {
        const api = fakeApi();
        api.passwordLogin.mockResolvedValue(authFor('alice'));
        render(
            <App
                telegram={resolveTelegram({})}
                api={api}
                session={new Session()}
                home={(p) => <p>home {p.username}</p>}
            />,
        );

        expect(screen.getByText(t('dev.notice'))).toBeTruthy();
        fireEvent.input(screen.getByTestId('dev-username'), { target: { value: 'alice' } });
        fireEvent.input(screen.getByTestId('dev-password'), { target: { value: 'correct-horse-battery' } });
        fireEvent.click(screen.getByTestId('dev-sign-in'));

        await waitFor(() => expect(screen.getByText('home alice')).toBeTruthy());
        expect(api.passwordLogin).toHaveBeenCalledWith('alice', 'correct-horse-battery');
    });

    it('signs in with initData automatically inside Telegram', async () => {
        const api = fakeApi();
        api.telegramSignIn.mockResolvedValue(authFor('tg_1'));

        render(
            <App
                telegram={resolveTelegram({ Telegram: { WebApp: webApp('signed') } })}
                api={api}
                session={new Session()}
                home={(p) => <p>home {p.username}</p>}
            />,
        );

        await waitFor(() => expect(screen.getByText('home tg_1')).toBeTruthy());
        expect(screen.queryByTestId('dev-username')).toBeNull();
    });

    it('says plainly when Telegram sign-in fails', async () => {
        const api = fakeApi();
        api.telegramSignIn.mockRejectedValue(new ApiError(401, { detail: 'Invalid credentials' }));

        render(
            <App
                telegram={resolveTelegram({ Telegram: { WebApp: webApp('stale') } })}
                api={api}
                session={new Session()}
                home={() => <p>home</p>}
            />,
        );

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe(
                t('app.signInFailed', { error: 'Invalid credentials' }),
            ),
        );
    });
});
