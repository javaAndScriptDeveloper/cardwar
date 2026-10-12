import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { ChallengeView, FriendView, OutgoingChallengeView } from '../../api/types';
import { t } from '../../i18n';
import { Friends } from './Friends';

const friend = (playerId: string, overrides: Partial<FriendView> = {}): FriendView => ({
    playerId,
    username: playerId,
    displayName: `Name ${playerId}`,
    played: 4,
    won: 3,
    lost: 1,
    lastPlayedAt: '2026-10-12T10:00:00Z',
    ...overrides,
});

const challenge = (
    inviteId: string,
    stake = 100,
    from: Partial<ChallengeView['from']> = {},
): ChallengeView => ({
    inviteId,
    from: { playerId: 'p9', username: 'olya', displayName: 'Оля', ...from },
    stake,
    expiresAt: '2099-01-01T00:00:00Z',
});

const sent = (inviteId: string, status: OutgoingChallengeView['status']): OutgoingChallengeView => ({
    inviteId,
    to: { playerId: 'p3', username: 'taras', displayName: 'Тарас' },
    stake: 0,
    status,
    createdAt: '2026-10-12T10:00:00Z',
    expiresAt: '2026-10-12T10:15:00Z',
});

function setup(
    options: {
        friends?: FriendView[] | Error;
        challenges?: ChallengeView[];
        outgoing?: OutgoingChallengeView[];
    } = {},
) {
    const friends = options.friends ?? [friend('p1'), friend('p2', { won: 0, lost: 2, played: 2 })];
    const props = {
        api: {
            friends:
                friends instanceof Error
                    ? vi.fn().mockRejectedValue(friends)
                    : vi.fn().mockResolvedValue(friends),
        },
        challenges: options.challenges ?? [],
        outgoing: options.outgoing ?? [],
        onChallenge: vi.fn(),
        onAccept: vi.fn().mockResolvedValue(undefined),
        onDecline: vi.fn().mockResolvedValue(undefined),
        onInvite: vi.fn(),
        retryMs: 1,
    };
    render(<Friends {...props} />);
    return props;
}

describe('Friends', () => {
    it('shows the challenges you sent with the friend and where each stands', async () => {
        setup({ outgoing: [sent('i1', 'WAITING'), sent('i2', 'DECLINED'), sent('i3', 'EXPIRED')] });

        const rows = await screen.findAllByTestId('outgoing-row');
        expect(rows.map((row) => row.getAttribute('data-status'))).toEqual([
            'WAITING',
            'DECLINED',
            'EXPIRED',
        ]);
        expect(rows.map((row) => row.getAttribute('data-invite'))).toEqual(['i1', 'i2', 'i3']);
        expect(within(rows[0] as HTMLElement).getByText('Тарас')).toBeTruthy();
        expect(within(rows[1] as HTMLElement).getByTestId('outgoing-status').textContent).toBe(
            t('friends.status.declined'),
        );
    });

    it('has no outgoing section when you challenged nobody', async () => {
        setup();

        await screen.findAllByTestId('friend-row');
        expect(screen.queryByTestId('outgoing')).toBeNull();
    });

    it('lists friends with the record between you and a challenge button each', async () => {
        const props = setup();

        const rows = await screen.findAllByTestId('friend-row');
        expect(rows.map((row) => row.getAttribute('data-player'))).toEqual(['p1', 'p2']);
        const first = within(rows[0] as HTMLElement);
        expect(first.getByTestId('friend-record').textContent).toBe('3:1');
        expect(first.getByText('Name p1')).toBeTruthy();
        expect(first.getByTestId('friend-last-played').textContent).not.toBe('');

        fireEvent.click(screen.getByTestId('challenge-p2'));
        expect(props.onChallenge).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'p2' }));
    });

    it("shows a friend's Telegram photo and @handle", async () => {
        setup({
            friends: [
                friend('p1', { handle: 'olya', photoUrl: 'https://t.me/i/userpic/320/olya.svg' }),
                friend('p2'),
            ],
        });

        const rows = await screen.findAllByTestId('friend-row');
        const first = rows[0] as HTMLElement;
        expect(within(first).getByTestId('friend-handle').textContent).toBe('@olya');
        expect(first.querySelector('img.avatar')?.getAttribute('src')).toBe(
            'https://t.me/i/userpic/320/olya.svg',
        );
        expect(within(rows[1] as HTMLElement).queryByTestId('friend-handle')).toBeNull();
    });

    it("shows the challenger's photo", async () => {
        setup({ challenges: [challenge('i1', 0, { photoUrl: 'https://t.me/i/userpic/320/olya.svg' })] });

        const row = await screen.findByTestId('challenge-row');
        expect(row.querySelector('img.avatar')?.getAttribute('src')).toBe(
            'https://t.me/i/userpic/320/olya.svg',
        );
    });

    it('explains itself and offers an invite when there is nobody yet', async () => {
        const props = setup({ friends: [] });

        fireEvent.click(await screen.findByTestId('friends-invite'));

        expect(screen.getByText(t('friends.empty'))).toBeTruthy();
        expect(props.onInvite).toHaveBeenCalled();
    });

    it('says so when the list cannot load', async () => {
        setup({ friends: new Error('offline') });

        expect(await screen.findByRole('alert')).toBeTruthy();
    });

    it('retries a failed load, so a throttled request right after a duel still shows the friend', async () => {
        const friendsApi = vi
            .fn()
            .mockRejectedValueOnce(new Error('too many requests'))
            .mockResolvedValue([friend('p1')]);
        render(
            <Friends
                api={{ friends: friendsApi }}
                challenges={[]}
                outgoing={[]}
                onChallenge={vi.fn()}
                onAccept={vi.fn().mockResolvedValue(undefined)}
                onDecline={vi.fn().mockResolvedValue(undefined)}
                onInvite={vi.fn()}
                retryMs={5}
            />,
        );

        expect(await screen.findAllByTestId('friend-row')).toHaveLength(1);
        expect(friendsApi).toHaveBeenCalledTimes(2);
    });

    it('shows incoming challenges at the top with accept and decline', async () => {
        const props = setup({ challenges: [challenge('inv-1', 500), challenge('inv-2', 0)] });

        const rows = screen.getAllByTestId('challenge-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]?.getAttribute('data-stake')).toBe('500');
        expect(within(rows[0] as HTMLElement).getByText('Оля')).toBeTruthy();

        fireEvent.click(screen.getByTestId('accept-inv-1'));
        fireEvent.click(screen.getByTestId('decline-inv-2'));

        await waitFor(() => expect(props.onAccept).toHaveBeenCalledWith('inv-1'));
        expect(props.onDecline).toHaveBeenCalledWith('inv-2');
    });
});
