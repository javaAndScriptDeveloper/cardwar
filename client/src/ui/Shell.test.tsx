import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { DailyBonusView, DuelView, InviteView, WalletView } from '../api/types';
import { t } from '../i18n';
import { navigate } from '../router';
import { wallet } from '../state/wallet';
import { resolveTelegram, type Telegram } from '../telegram/webapp';
import { Shell } from './Shell';

const player = { playerId: 'me', username: 'alice', displayName: 'Аліса Коваль' };
const links = { botUsername: 'cardwar_gaming_bot', origin: 'https://x' };

function fakeApi() {
    return {
        activeDuels: vi.fn().mockResolvedValue([]),
        pendingInvite: vi.fn().mockResolvedValue(undefined),
        createInvite: vi.fn(),
        inviteStatus: vi.fn(),
        acceptInvite: vi.fn(),
        history: vi.fn().mockResolvedValue([]),
        wallet: vi.fn().mockResolvedValue(walletView(500)),
        claimDailyBonus: vi.fn(),
        transactions: vi.fn().mockResolvedValue([]),
    };
}

function walletView(balance: number, bonus: Partial<DailyBonusView> = {}): WalletView {
    return {
        balance,
        dailyBonus: { available: true, amount: 75, streakDay: 2, nextAt: '2099-01-01T00:00:00Z', ...bonus },
    };
}

const pending = (inviteId: string, stake = 0): InviteView => ({
    inviteId,
    status: 'PENDING',
    expiresAt: '2099-01-01T00:00:00Z',
    stake,
});
const duelView = (duelId: string) => ({ duelId }) as DuelView;

/** The invite button opens the stake picker; the invite is created once a stake is chosen. */
async function inviteWithStake(stake: number) {
    fireEvent.click(await screen.findByTestId('invite'));
    await screen.findByTestId('stake-picker');
    fireEvent.click(screen.getByTestId(`stake-${stake}`));
}

function renderShell(
    api: ReturnType<typeof fakeApi>,
    options: { invite?: string; telegram?: Telegram } = {},
) {
    return render(
        <Shell
            player={player}
            api={api}
            telegram={options.telegram ?? resolveTelegram({})}
            invite={options.invite}
            links={links}
            pollMs={5}
            table={(duelId, exit) => (
                <div>
                    <p>table {duelId}</p>
                    <button onClick={exit}>leave</button>
                </div>
            )}
        />,
    );
}

describe('Shell', () => {
    beforeEach(() => {
        window.location.hash = '';
        wallet.value = undefined;
    });

    describe('coins', () => {
        it('shows the balance once the wallet loads', async () => {
            renderShell(fakeApi());

            await waitFor(() =>
                expect(screen.getByTestId('balance').getAttribute('data-balance')).toBe('500'),
            );
        });

        it('claims the daily bonus and shows the new balance', async () => {
            const api = fakeApi();
            api.claimDailyBonus.mockResolvedValue(walletView(575, { available: false, streakDay: 2 }));

            renderShell(api);
            const claim = await screen.findByTestId('claim-bonus');
            expect(screen.getByTestId('daily-bonus').textContent).toContain(t('lobby.bonus.day', { n: 2 }));
            expect(screen.getByTestId('daily-bonus').getAttribute('data-amount')).toBe('75');
            fireEvent.click(claim);

            await waitFor(() =>
                expect(screen.getByTestId('balance').getAttribute('data-balance')).toBe('575'),
            );
            expect(api.claimDailyBonus).toHaveBeenCalledTimes(1);
            expect((screen.getByTestId('claim-bonus') as HTMLButtonElement).disabled).toBe(true);
        });

        it('a bonus already claimed on another device just refreshes the wallet', async () => {
            const api = fakeApi();
            api.claimDailyBonus.mockRejectedValue(new ApiError(409, { reason: 'BONUS_ALREADY_CLAIMED' }));
            api.wallet
                .mockResolvedValueOnce(walletView(500))
                .mockResolvedValue(walletView(550, { available: false }));

            renderShell(api);
            fireEvent.click(await screen.findByTestId('claim-bonus'));

            await waitFor(() =>
                expect(screen.getByTestId('balance').getAttribute('data-balance')).toBe('550'),
            );
            expect(screen.queryByRole('alert')).toBeNull();
        });

        it('counts down to the next bonus when today’s is taken', async () => {
            const api = fakeApi();
            const nextAt = new Date(Date.now() + (3 * 3600 + 2 * 60 + 30) * 1000).toISOString();
            api.wallet.mockResolvedValue(walletView(500, { available: false, nextAt }));

            renderShell(api);

            const countdown = await screen.findByTestId('bonus-countdown');
            expect(countdown.textContent).toMatch(/3:02:[23]\d/);
            expect((screen.getByTestId('claim-bonus') as HTMLButtonElement).disabled).toBe(true);
        });

        it('picks a stake, disabling the ones above the balance, and shows it while waiting', async () => {
            const api = fakeApi();
            api.createInvite.mockResolvedValue(pending('inv-s', 100));
            api.inviteStatus.mockResolvedValue(pending('inv-s', 100));

            renderShell(api);
            await waitFor(() => expect(screen.getByTestId('balance')).toBeTruthy());
            fireEvent.click(await screen.findByTestId('invite'));
            await screen.findByTestId('stake-picker');

            const option = (n: number) => screen.getByTestId(`stake-${n}`) as HTMLButtonElement;
            expect([0, 100, 500, 1000, 5000].map((n) => option(n).disabled)).toEqual([
                false,
                false,
                false,
                true,
                true,
            ]);
            expect(option(0).textContent).toContain(t('stake.friendly'));
            fireEvent.click(option(100));

            await waitFor(() =>
                expect(screen.getByTestId('invite-stake').getAttribute('data-stake')).toBe('100'),
            );
            expect(api.createInvite).toHaveBeenCalledWith(100);
            expect(screen.queryByTestId('stake-picker')).toBeNull();
        });

        it.each(['INSUFFICIENT_COINS', 'INVALID_STAKE'])('explains a rejected stake (%s)', async (reason) => {
            const api = fakeApi();
            api.createInvite.mockRejectedValue(new ApiError(400, { reason }));

            renderShell(api);
            await inviteWithStake(0);

            await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(t(`reason.${reason}`)));
        });

        it('explains an invite that cannot be accepted for lack of coins', async () => {
            const api = fakeApi();
            api.acceptInvite.mockRejectedValue(new ApiError(400, { reason: 'INSUFFICIENT_COINS' }));

            renderShell(api, { invite: 'inv-rich' });

            await waitFor(() =>
                expect(screen.getByRole('alert').textContent).toBe(t('reason.INSUFFICIENT_COINS')),
            );
        });

        it('refreshes the balance after a duel', async () => {
            const api = fakeApi();
            api.activeDuels.mockResolvedValue([{ duelId: 'd-active' }]);
            api.wallet.mockResolvedValueOnce(walletView(400)).mockResolvedValue(walletView(600));

            renderShell(api);
            fireEvent.click(await screen.findByText('leave'));

            await waitFor(() =>
                expect(screen.getByTestId('balance').getAttribute('data-balance')).toBe('600'),
            );
        });
    });

    it('lands on the lobby with the greeting and bottom navigation', async () => {
        renderShell(fakeApi());

        expect(await screen.findByTestId('invite')).toBeTruthy();
        expect(screen.getByText(t('lobby.greeting', { name: 'Аліса Коваль' }))).toBeTruthy();
        expect(screen.getByTestId('nav-lobby').getAttribute('aria-current')).toBe('page');
        expect(screen.getByText(t('lobby.howTo1'))).toBeTruthy();
    });

    it('goes straight back to an active duel', async () => {
        const api = fakeApi();
        api.activeDuels.mockResolvedValue([{ duelId: 'd-active' }]);

        renderShell(api, { invite: 'ignored' });

        await waitFor(() => expect(screen.getByText('table d-active')).toBeTruthy());
        expect(api.acceptInvite).not.toHaveBeenCalled();
        expect(screen.queryByTestId('nav-lobby')).toBeNull();
    });

    it('accepts the invite it was opened with, once', async () => {
        const api = fakeApi();
        api.acceptInvite.mockResolvedValue(duelView('d-new'));

        renderShell(api, { invite: 'inv-1' });

        await waitFor(() => expect(screen.getByText('table d-new')).toBeTruthy());
        expect(api.acceptInvite).toHaveBeenCalledWith('inv-1');
        fireEvent.click(screen.getByText('leave'));
        await waitFor(() => expect(screen.getByTestId('invite')).toBeTruthy());
        expect(api.acceptInvite).toHaveBeenCalledTimes(1);
    });

    it.each([
        [404, 'lobby.errors.inviteExpired'],
        [400, 'lobby.errors.ownInvite'],
        [409, 'lobby.errors.inviteTaken'],
    ])('explains a failed invite (%i) and offers the lobby', async (status, key) => {
        const api = fakeApi();
        api.acceptInvite.mockRejectedValue(new ApiError(status));

        renderShell(api, { invite: 'inv-1' });

        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(t(key)));
        expect(screen.getByTestId('invite')).toBeTruthy();
    });

    it('invite is one tap: creates, shows the code and opens the Telegram share sheet', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-9'));
        api.inviteStatus
            .mockResolvedValueOnce(pending('inv-9'))
            .mockResolvedValue({ ...pending('inv-9'), status: 'ACCEPTED', duelId: 'd-9' });
        const telegram: Telegram = { ...resolveTelegram({}), inTelegram: true, openTelegramLink: vi.fn() };

        renderShell(api, { telegram });
        await inviteWithStake(0);

        await waitFor(() => expect(screen.getByTestId('invite-code').textContent).toBe('inv-9'));
        expect(telegram.openTelegramLink).toHaveBeenCalledWith(
            expect.stringContaining(encodeURIComponent('https://t.me/cardwar_gaming_bot?start=inv-9')),
        );
        await waitFor(() => expect(screen.getByText('table d-9')).toBeTruthy());
    });

    it('outside Telegram the invite shows the code and share only on request', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-2'));
        api.inviteStatus.mockResolvedValue(pending('inv-2'));
        const open = vi.fn();
        const telegram = resolveTelegram({ open });

        renderShell(api, { telegram });
        await inviteWithStake(0);

        await screen.findByTestId('invite-code');
        expect(open).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('share-invite'));
        expect(open).toHaveBeenCalledWith(expect.stringContaining('t.me/share/url'), '_blank');
    });

    it('cancelling a pending invite returns to the lobby and stops polling', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-2'));
        api.inviteStatus.mockResolvedValue(pending('inv-2'));

        renderShell(api);
        await inviteWithStake(0);
        fireEvent.click(await screen.findByTestId('cancel-invite'));

        await waitFor(() => expect(screen.getByTestId('invite')).toBeTruthy());
        const calls = api.inviteStatus.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(api.inviteStatus.mock.calls.length).toBe(calls);
    });

    it('tells the creator when the invite expired while waiting', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-3'));
        api.inviteStatus.mockRejectedValue(new ApiError(404));

        renderShell(api);
        await inviteWithStake(0);

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe(t('lobby.errors.waitExpired')),
        );
    });

    it('reopening the app goes back to the invite it was waiting on', async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-open'));
        api.inviteStatus.mockResolvedValue(pending('inv-open'));

        renderShell(api);

        await waitFor(() => expect(screen.getByTestId('invite-code').textContent).toBe('inv-open'));
        expect(api.createInvite).not.toHaveBeenCalled();
    });

    it("a launch invite wins over the player's own pending one", async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-own'));
        api.acceptInvite.mockResolvedValue(duelView('d-friend'));

        renderShell(api, { invite: 'inv-friend' });

        await waitFor(() => expect(screen.getByText('table d-friend')).toBeTruthy());
    });

    it('back from settings keeps the waiting screen', async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-open'));
        api.inviteStatus.mockResolvedValue(pending('inv-open'));

        renderShell(api);
        await screen.findByTestId('invite-code');
        await act(() => navigate({ name: 'settings' }));
        await screen.findByTestId('settings-screen');
        await act(() => navigate({ name: 'lobby' }));

        await waitFor(() => expect(screen.getByTestId('invite-code').textContent).toBe('inv-open'));
        expect(api.createInvite).not.toHaveBeenCalled();
    });

    it('switches tabs through the bottom navigation and hides it in settings', async () => {
        renderShell(fakeApi());

        fireEvent.click(await screen.findByTestId('nav-friends'));
        expect(await screen.findByTestId('friends-screen')).toBeTruthy();
        fireEvent.click(screen.getByTestId('nav-shop'));
        expect(await screen.findByTestId('shop-screen')).toBeTruthy();
        fireEvent.click(screen.getByTestId('nav-profile'));
        expect(await screen.findByTestId('profile-screen')).toBeTruthy();
        fireEvent.click(screen.getByTestId('open-settings'));
        expect(await screen.findByTestId('settings-screen')).toBeTruthy();
        expect(screen.queryByTestId('nav-lobby')).toBeNull();
    });

    it('wires the Telegram BackButton on sub-screens only', async () => {
        const telegram: Telegram = { ...resolveTelegram({}), inTelegram: true, backButton: vi.fn() };

        renderShell(fakeApi(), { telegram });
        await screen.findByTestId('invite');
        expect(telegram.backButton).toHaveBeenLastCalledWith(false);

        await act(() => navigate({ name: 'friends' }));
        await screen.findByTestId('friends-screen');
        await waitFor(() => expect(telegram.backButton).toHaveBeenLastCalledWith(true, expect.any(Function)));
    });

    it('copies the invite code', async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-copy'));
        api.inviteStatus.mockResolvedValue(pending('inv-copy'));
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

        renderShell(api);
        fireEvent.click(await screen.findByTestId('copy-code'));

        expect(writeText).toHaveBeenCalledWith('inv-copy');
        await waitFor(() => expect(screen.getByTestId('copy-code').textContent).toBe(t('waiting.copied')));
    });

    it('joins with a pasted code', async () => {
        const api = fakeApi();
        api.acceptInvite.mockResolvedValue(duelView('d-code'));

        renderShell(api);
        fireEvent.input(await screen.findByTestId('join-code'), { target: { value: ' inv-7 ' } });
        fireEvent.click(screen.getByTestId('join'));

        await waitFor(() => expect(screen.getByText('table d-code')).toBeTruthy());
        expect(api.acceptInvite).toHaveBeenCalledWith('inv-7');
    });
});
