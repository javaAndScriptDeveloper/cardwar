import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type {
    ChallengeView,
    DailyBonusView,
    DuelView,
    FriendView,
    InviteView,
    MatchView,
    WalletView,
} from '../api/types';
import { t } from '../i18n';
import { navigate } from '../router';
import { reportRequest, resetConnection } from '../state/connection';
import { loadout } from '../state/loadout';
import { DEFAULT_SETTINGS, settings } from '../state/settings';
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
        enterMatchmaking: vi.fn(),
        matchmakingStatus: vi.fn().mockResolvedValue(undefined),
        leaveMatchmaking: vi.fn().mockResolvedValue(undefined),
        shop: vi.fn().mockResolvedValue({ items: [], coinPacks: [] }),
        buyItem: vi.fn(),
        equipItem: vi.fn(),
        starsInvoice: vi.fn(),
        friends: vi.fn().mockResolvedValue([]),
        challenge: vi.fn(),
        challenges: vi.fn().mockResolvedValue([]),
        outgoingChallenges: vi.fn().mockResolvedValue([]),
        declineInvite: vi.fn().mockResolvedValue(undefined),
        loadout: vi.fn().mockResolvedValue({
            deck: 'classic',
            cardBack: 'classic',
            table: 'green',
            emotes: [],
        }),
    };
}

const match = (status: MatchView['status'], stake = 0, duelId?: string): MatchView => ({
    status,
    stake,
    since: new Date(Date.now() - 7000).toISOString(),
    ...(duelId !== undefined && { duelId }),
});

/** Quick match opens the same stake picker; the search starts once a stake is chosen. */
async function quickMatchWithStake(stake: number) {
    fireEvent.click(await screen.findByTestId('quick-match'));
    await screen.findByTestId('stake-picker');
    fireEvent.click(screen.getByTestId(`stake-${stake}`));
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
            challengePollMs={10}
            offlineGraceMs={0}
            table={(duelId, exit) => (
                <div>
                    <p>table {duelId}</p>
                    <button onClick={exit}>leave</button>
                </div>
            )}
        />,
    );
}

const friendView = (playerId: string, displayName: string): FriendView => ({
    playerId,
    username: playerId,
    displayName,
    played: 1,
    won: 1,
    lost: 0,
    lastPlayedAt: '2026-10-12T10:00:00Z',
});

const incoming = (inviteId: string, stake = 0): ChallengeView => ({
    inviteId,
    from: { playerId: 'p9', username: 'olya', displayName: 'Оля' },
    stake,
    expiresAt: '2099-01-01T00:00:00Z',
});

describe('Shell', () => {
    beforeEach(() => {
        window.location.hash = '';
        wallet.value = undefined;
        loadout.value = undefined;
        settings.value = DEFAULT_SETTINGS;
        resetConnection();
    });

    describe('connection', () => {
        it('shows the no-connection banner on every screen, the duel included, until a request gets through', async () => {
            renderShell(fakeApi());
            await screen.findByTestId('balance');
            expect(screen.queryByTestId('offline-banner')).toBeNull();

            act(() => reportRequest(false));
            expect(await screen.findByTestId('offline-banner')).toBeTruthy();

            await act(() => navigate({ name: 'duel', duelId: 'd1' }));
            await screen.findByText('table d1');
            expect(screen.getByTestId('offline-banner')).toBeTruthy();

            act(() => reportRequest(true));
            await waitFor(() => expect(screen.queryByTestId('offline-banner')).toBeNull());
        });
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

    describe('quick match', () => {
        it('offers every table in the stake picker, unaffordable ones disabled', async () => {
            renderShell(fakeApi());
            await waitFor(() => expect(screen.getByTestId('balance')).toBeTruthy());

            fireEvent.click(await screen.findByTestId('quick-match'));
            await screen.findByTestId('stake-picker');

            const option = (n: number) => screen.getByTestId(`stake-${n}`) as HTMLButtonElement;
            expect([0, 100, 500, 1000, 5000].map((n) => option(n).disabled)).toEqual([
                false,
                false,
                false,
                true,
                true,
            ]);
        });

        it('searches at the chosen stake and goes to the duel once matched', async () => {
            const api = fakeApi();
            api.enterMatchmaking.mockResolvedValue(match('WAITING', 100));
            api.matchmakingStatus
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(match('WAITING', 100))
                .mockResolvedValue(match('MATCHED', 100, 'd-qm'));

            renderShell(api);
            await waitFor(() => expect(screen.getByTestId('balance')).toBeTruthy());
            await quickMatchWithStake(100);

            await screen.findByTestId('searching-screen');
            expect(api.enterMatchmaking).toHaveBeenCalledWith(100);
            expect(screen.getByTestId('search-stake').getAttribute('data-stake')).toBe('100');
            expect(api.createInvite).not.toHaveBeenCalled();
            await waitFor(() => expect(screen.getByText('table d-qm')).toBeTruthy());
        });

        it('goes straight to the duel when somebody was already waiting', async () => {
            const api = fakeApi();
            api.enterMatchmaking.mockResolvedValue(match('MATCHED', 0, 'd-fast'));

            renderShell(api);
            await quickMatchWithStake(0);

            await waitFor(() => expect(screen.getByText('table d-fast')).toBeTruthy());
        });

        it('shows the seconds spent searching', async () => {
            const api = fakeApi();
            api.enterMatchmaking.mockResolvedValue(match('WAITING'));
            api.matchmakingStatus.mockResolvedValueOnce(undefined).mockResolvedValue(match('WAITING'));

            renderShell(api);
            await quickMatchWithStake(0);

            const elapsed = await screen.findByTestId('search-elapsed');
            expect(Number(elapsed.getAttribute('data-seconds'))).toBeGreaterThanOrEqual(7);
        });

        it.each([
            ['expired', () => Promise.resolve(match('EXPIRED'))],
            ['gone', () => Promise.resolve(undefined)],
        ])('returns to the lobby with a hint to invite a friend when the entry is %s', async (_, status) => {
            const api = fakeApi();
            api.enterMatchmaking.mockResolvedValue(match('WAITING'));
            api.matchmakingStatus.mockImplementation(status);

            renderShell(api);
            await quickMatchWithStake(0);

            await waitFor(() =>
                expect(screen.getByRole('alert').textContent).toBe(t('lobby.errors.searchExpired')),
            );
            expect(screen.getByTestId('invite')).toBeTruthy();
        });

        it('cancelling leaves the queue, returns to the lobby and stops polling', async () => {
            const api = fakeApi();
            api.enterMatchmaking.mockResolvedValue(match('WAITING'));
            api.matchmakingStatus.mockResolvedValueOnce(undefined).mockResolvedValue(match('WAITING'));

            renderShell(api);
            await quickMatchWithStake(0);
            fireEvent.click(await screen.findByTestId('cancel-search'));

            await waitFor(() => expect(screen.getByTestId('quick-match')).toBeTruthy());
            expect(api.leaveMatchmaking).toHaveBeenCalledTimes(1);
            const calls = api.matchmakingStatus.mock.calls.length;
            await new Promise((resolve) => setTimeout(resolve, 30));
            expect(api.matchmakingStatus.mock.calls.length).toBe(calls);
        });

        it('a match that landed while cancelling still opens the duel', async () => {
            const api = fakeApi();
            api.enterMatchmaking.mockResolvedValue(match('WAITING'));
            api.matchmakingStatus.mockResolvedValueOnce(undefined).mockResolvedValue(match('WAITING'));

            renderShell(api);
            await quickMatchWithStake(0);
            api.activeDuels.mockResolvedValue([{ duelId: 'd-race' }]);
            fireEvent.click(await screen.findByTestId('cancel-search'));

            await waitFor(() => expect(screen.getByText('table d-race')).toBeTruthy());
        });

        it('explains a rejected stake', async () => {
            const api = fakeApi();
            api.enterMatchmaking.mockRejectedValue(new ApiError(400, { reason: 'INSUFFICIENT_COINS' }));

            renderShell(api);
            await quickMatchWithStake(0);

            await waitFor(() =>
                expect(screen.getByRole('alert').textContent).toBe(t('reason.INSUFFICIENT_COINS')),
            );
        });

        it('reopening the app resumes a search in progress', async () => {
            const api = fakeApi();
            api.matchmakingStatus.mockResolvedValue(match('WAITING', 500));
            api.pendingInvite.mockResolvedValue(pending('inv-own'));

            renderShell(api);

            await waitFor(() =>
                expect(screen.getByTestId('search-stake').getAttribute('data-stake')).toBe('500'),
            );
            expect(api.enterMatchmaking).not.toHaveBeenCalled();
        });

        it('reopening the app after being matched opens that duel', async () => {
            const api = fakeApi();
            api.matchmakingStatus.mockResolvedValue(match('MATCHED', 0, 'd-matched'));

            renderShell(api);

            await waitFor(() => expect(screen.getByText('table d-matched')).toBeTruthy());
        });

        it('an active duel and a launch invite both win over a search in progress', async () => {
            const api = fakeApi();
            api.matchmakingStatus.mockResolvedValue(match('WAITING'));
            api.acceptInvite.mockResolvedValue(duelView('d-friend'));

            renderShell(api, { invite: 'inv-friend' });

            await waitFor(() => expect(screen.getByText('table d-friend')).toBeTruthy());
            expect(api.matchmakingStatus).not.toHaveBeenCalled();
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

    it("loads the server loadout at sign-in; its deck becomes the device's deck", async () => {
        const api = fakeApi();
        api.loadout.mockResolvedValue({
            deck: 'memes-demo',
            cardBack: 'trident',
            table: 'night',
            emotes: [],
        });

        renderShell(api);

        await waitFor(() => expect(settings.value.deck).toBe('memes-demo'));
        expect(loadout.value?.cardBack).toBe('trident');
    });

    describe('friends and challenges', () => {
        it('challenges a friend at a stake and waits for them, without a share link', async () => {
            const api = fakeApi();
            api.friends.mockResolvedValue([friendView('p2', 'Богдан')]);
            api.challenge.mockResolvedValue({ ...pending('inv-c', 100), invitee: 'p2' });
            api.inviteStatus.mockResolvedValue({ ...pending('inv-c', 100), invitee: 'p2' });

            renderShell(api);
            fireEvent.click(await screen.findByTestId('nav-friends'));
            fireEvent.click(await screen.findByTestId('challenge-p2'));
            await screen.findByTestId('stake-picker');
            fireEvent.click(screen.getByTestId('stake-100'));

            await waitFor(() => expect(api.challenge).toHaveBeenCalledWith('p2', 100));
            expect((await screen.findByTestId('invite-stake')).getAttribute('data-stake')).toBe('100');
            expect(screen.getByTestId('waiting-screen').getAttribute('data-challenge')).toBe('true');
            expect(screen.getByTestId('waiting-screen').textContent).toContain('Богдан');
            expect(screen.queryByTestId('share-invite')).toBeNull();
        });

        it('lists the challenge you just sent when you are back on the friends screen', async () => {
            const api = fakeApi();
            api.friends.mockResolvedValue([friendView('p2', 'Богдан')]);
            api.challenge.mockResolvedValue({ ...pending('inv-c', 100), invitee: 'p2' });
            api.inviteStatus.mockResolvedValue({ ...pending('inv-c', 100), invitee: 'p2' });
            const sent = {
                inviteId: 'inv-c',
                to: { playerId: 'p2', username: 'bohdan', displayName: 'Богдан' },
                stake: 100,
                status: 'WAITING' as const,
                createdAt: '2026-10-12T10:00:00Z',
                expiresAt: '2099-01-01T00:00:00Z',
            };
            api.outgoingChallenges.mockResolvedValueOnce([]).mockResolvedValue([sent]);

            renderShell(api);
            fireEvent.click(await screen.findByTestId('nav-friends'));
            fireEvent.click(await screen.findByTestId('challenge-p2'));
            fireEvent.click(await screen.findByTestId('stake-100'));
            await screen.findByTestId('waiting-screen');
            fireEvent.click(screen.getByTestId('nav-friends'));

            const row = await screen.findByTestId('outgoing-row');
            expect(row.getAttribute('data-status')).toBe('WAITING');
            expect(row.getAttribute('data-invite')).toBe('inv-c');
        });

        it('tells the challenger the friend declined, and goes back to the lobby', async () => {
            const api = fakeApi();
            api.friends.mockResolvedValue([friendView('p2', 'Богдан')]);
            api.challenge.mockResolvedValue({ ...pending('inv-d'), invitee: 'p2' });
            api.inviteStatus.mockResolvedValue({ ...pending('inv-d'), invitee: 'p2', status: 'DECLINED' });

            renderShell(api);
            fireEvent.click(await screen.findByTestId('nav-friends'));
            fireEvent.click(await screen.findByTestId('challenge-p2'));
            fireEvent.click(await screen.findByTestId('stake-0'));

            const declined = await screen.findByTestId('invite-declined');
            expect(declined.textContent).toBe(t('waiting.declined', { name: 'Богдан' }));
            const calls = api.inviteStatus.mock.calls.length;
            await new Promise((resolve) => setTimeout(resolve, 30));
            expect(api.inviteStatus.mock.calls.length).toBe(calls);
            fireEvent.click(screen.getByTestId('cancel-invite'));
            expect(await screen.findByTestId('invite')).toBeTruthy();
        });

        it('explains a refused challenge', async () => {
            const api = fakeApi();
            api.friends.mockResolvedValue([friendView('p2', 'Богдан')]);
            api.challenge.mockRejectedValue(new ApiError(400, { reason: 'NOT_A_FRIEND' }));

            renderShell(api);
            fireEvent.click(await screen.findByTestId('nav-friends'));
            fireEvent.click(await screen.findByTestId('challenge-p2'));
            fireEvent.click(await screen.findByTestId('stake-0'));

            await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(t('reason.NOT_A_FRIEND')));
        });

        it('badges the nav with incoming challenges, polled while in the lobby', async () => {
            const api = fakeApi();
            api.challenges
                .mockResolvedValueOnce([])
                .mockResolvedValue([incoming('inv-1'), incoming('inv-2')]);

            renderShell(api);

            const badge = await screen.findByTestId('challenges-badge');
            expect(badge.getAttribute('data-count')).toBe('2');
            expect(api.challenges.mock.calls.length).toBeGreaterThan(1);
        });

        it('stops polling challenges at the table', async () => {
            const api = fakeApi();
            renderShell(api);
            await waitFor(() => expect(api.challenges).toHaveBeenCalled());

            await act(() => navigate({ name: 'duel', duelId: 'd1' }));
            await screen.findByText('table d1');
            // Effect cleanups run after paint, so give the interval's teardown a moment before counting.
            await new Promise((resolve) => setTimeout(resolve, 30));
            const calls = api.challenges.mock.calls.length;
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(api.challenges.mock.calls.length).toBe(calls);
        });

        it('accepts a challenge from the inbox and opens the duel', async () => {
            const api = fakeApi();
            api.challenges.mockResolvedValue([incoming('inv-1', 100)]);
            api.acceptInvite.mockResolvedValue(duelView('d-ch'));

            renderShell(api);
            fireEvent.click(await screen.findByTestId('nav-friends'));
            fireEvent.click(await screen.findByTestId('accept-inv-1'));

            await waitFor(() => expect(screen.getByText('table d-ch')).toBeTruthy());
            expect(api.acceptInvite).toHaveBeenCalledWith('inv-1');
        });

        it('declines a challenge, which leaves the inbox and the badge', async () => {
            const api = fakeApi();
            api.challenges.mockResolvedValueOnce([incoming('inv-1')]).mockResolvedValue([]);

            renderShell(api);
            fireEvent.click(await screen.findByTestId('nav-friends'));
            fireEvent.click(await screen.findByTestId('decline-inv-1'));

            await waitFor(() => expect(screen.queryByTestId('challenge-row')).toBeNull());
            expect(api.declineInvite).toHaveBeenCalledWith('inv-1');
            expect(screen.queryByTestId('challenges-badge')).toBeNull();
        });
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
