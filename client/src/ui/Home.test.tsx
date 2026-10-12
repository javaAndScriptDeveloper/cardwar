import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { DuelView, InviteView } from '../api/types';
import { resolveTelegram, type Telegram } from '../telegram/webapp';
import { Home } from './Home';

const player = { playerId: 'me', username: 'alice' };
const links = { botUsername: 'cardwar_gaming_bot', origin: 'https://x' };

function fakeApi() {
    return {
        activeDuels: vi.fn().mockResolvedValue([]),
        pendingInvite: vi.fn().mockResolvedValue(undefined),
        createInvite: vi.fn(),
        inviteStatus: vi.fn(),
        acceptInvite: vi.fn(),
    };
}

const pending = (inviteId: string): InviteView => ({
    inviteId,
    status: 'PENDING',
    expiresAt: '2099-01-01T00:00:00Z',
});
const duelView = (duelId: string) => ({ duelId }) as DuelView;

function renderHome(api: ReturnType<typeof fakeApi>, options: { invite?: string; telegram?: Telegram } = {}) {
    return render(
        <Home
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

describe('Home', () => {
    it('goes straight back to an active duel', async () => {
        const api = fakeApi();
        api.activeDuels.mockResolvedValue([{ duelId: 'd-active' }]);

        renderHome(api, { invite: 'ignored' });

        await waitFor(() => expect(screen.getByText('table d-active')).toBeTruthy());
        expect(api.acceptInvite).not.toHaveBeenCalled();
    });

    it('accepts the invite it was opened with, once', async () => {
        const api = fakeApi();
        api.acceptInvite.mockResolvedValue(duelView('d-new'));

        renderHome(api, { invite: 'inv-1' });

        await waitFor(() => expect(screen.getByText('table d-new')).toBeTruthy());
        expect(api.acceptInvite).toHaveBeenCalledWith('inv-1');
        fireEvent.click(screen.getByText('leave'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Invite a friend' })).toBeTruthy());
        expect(api.acceptInvite).toHaveBeenCalledTimes(1);
    });

    it.each([
        [404, /expired/i],
        [400, /your own invite/i],
        [409, /already/i],
    ])('explains a failed invite (%i) and offers the start screen', async (status, message) => {
        const api = fakeApi();
        api.acceptInvite.mockRejectedValue(new ApiError(status));

        renderHome(api, { invite: 'inv-1' });

        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(message));
        expect(screen.getByRole('button', { name: 'Invite a friend' })).toBeTruthy();
    });

    it('creates an invite, shares it through Telegram and opens the table once accepted', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-9'));
        api.inviteStatus
            .mockResolvedValueOnce(pending('inv-9'))
            .mockResolvedValue({ ...pending('inv-9'), status: 'ACCEPTED', duelId: 'd-9' });
        const telegram = { ...resolveTelegram({}), openTelegramLink: vi.fn() };

        renderHome(api, { telegram });
        fireEvent.click(await screen.findByRole('button', { name: 'Invite a friend' }));

        await waitFor(() => expect(screen.getByText('inv-9')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Share invite' }));
        expect(telegram.openTelegramLink).toHaveBeenCalledWith(
            expect.stringContaining(encodeURIComponent('https://t.me/cardwar_gaming_bot?start=inv-9')),
        );
        await waitFor(() => expect(screen.getByText('table d-9')).toBeTruthy());
    });

    it('cancelling a pending invite returns to the start screen and stops polling', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-2'));
        api.inviteStatus.mockResolvedValue(pending('inv-2'));

        renderHome(api);
        fireEvent.click(await screen.findByRole('button', { name: 'Invite a friend' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Invite a friend' })).toBeTruthy());
        const calls = api.inviteStatus.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(api.inviteStatus.mock.calls.length).toBe(calls);
    });

    it('tells the creator when the invite expired while waiting', async () => {
        const api = fakeApi();
        api.createInvite.mockResolvedValue(pending('inv-3'));
        api.inviteStatus.mockRejectedValue(new ApiError(404));

        renderHome(api);
        fireEvent.click(await screen.findByRole('button', { name: 'Invite a friend' }));

        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/expired/i));
    });

    it('reopening the app goes back to the invite it was waiting on', async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-open'));
        api.inviteStatus.mockResolvedValue(pending('inv-open'));

        renderHome(api);

        await waitFor(() => expect(screen.getByTestId('invite-code').textContent).toBe('inv-open'));
        expect(api.createInvite).not.toHaveBeenCalled();
    });

    it("a launch invite wins over the player's own pending one", async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-own'));
        api.acceptInvite.mockResolvedValue(duelView('d-friend'));

        renderHome(api, { invite: 'inv-friend' });

        await waitFor(() => expect(screen.getByText('table d-friend')).toBeTruthy());
    });

    it('copies the invite code', async () => {
        const api = fakeApi();
        api.pendingInvite.mockResolvedValue(pending('inv-copy'));
        api.inviteStatus.mockResolvedValue(pending('inv-copy'));
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

        renderHome(api);
        fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }));

        expect(writeText).toHaveBeenCalledWith('inv-copy');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
    });

    it('explains how to start on the start screen', async () => {
        renderHome(fakeApi());

        expect(await screen.findByText(/send the invite to a friend/i)).toBeTruthy();
    });

    it('joins with a pasted code', async () => {
        const api = fakeApi();
        api.acceptInvite.mockResolvedValue(duelView('d-code'));

        renderHome(api);
        fireEvent.input(await screen.findByLabelText('Invite code'), { target: { value: ' inv-7 ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Join' }));

        await waitFor(() => expect(screen.getByText('table d-code')).toBeTruthy());
        expect(api.acceptInvite).toHaveBeenCalledWith('inv-7');
    });
});
