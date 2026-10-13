import { render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { CoinTransactionView, DuelHistoryEntry, LeaderboardEntry, ProgressView } from '../../api/types';
import { t } from '../../i18n';
import { Profile } from './Profile';

const player = { playerId: 'me', username: 'alice', displayName: 'Аліса' };

const entry = (overrides: Partial<DuelHistoryEntry>): DuelHistoryEntry => ({
    duelId: 'd1',
    opponentId: 'o1',
    opponentUsername: 'bob',
    result: 'WON',
    endReason: 'OPPONENT_OUT_OF_CARDS',
    startedAt: '2026-10-12T10:00:00Z',
    finishedAt: '2026-10-12T10:05:00Z',
    moveCount: 21,
    stake: 0,
    coinDelta: 0,
    ...overrides,
});

const noTransactions = () => vi.fn().mockResolvedValue([]);

const progressView = (overrides: Partial<ProgressView> = {}): ProgressView => ({
    duelsPlayed: 4,
    duelsWon: 2,
    currencyBalance: 500,
    winStreak: 1,
    bestWinStreak: 2,
    xp: 120,
    rank: 'PIDKYDNYI',
    nextRankXp: 300,
    streakBonusPercent: 10,
    ...overrides,
});

/** The progress and leaderboard every profile reads; a test overrides the one it is about. */
const retention = () => ({
    progress: vi.fn().mockResolvedValue(progressView()),
    leaderboard: vi.fn().mockResolvedValue([] as LeaderboardEntry[]),
});

const tx = (amount: number, kind: CoinTransactionView['kind']): CoinTransactionView => ({
    amount,
    kind,
    createdAt: '2026-10-12T10:00:00Z',
});

describe('Profile', () => {
    it('names history opponents by display name and shows their photo', async () => {
        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([
                        entry({
                            opponentUsername: 'tg_7',
                            opponentDisplayName: 'Оля',
                            opponentPhotoUrl: 'https://t.me/i/userpic/320/olya.svg',
                        }),
                    ]),
                    transactions: noTransactions(),
                }}
                onOpenSettings={() => {}}
            />,
        );

        const row = await screen.findByTestId('history-row');
        expect(row.textContent).toContain(t('profile.vs', { name: 'Оля' }));
        expect(row.querySelector('img.avatar')?.getAttribute('src')).toBe(
            'https://t.me/i/userpic/320/olya.svg',
        );
    });

    it('shows the signed coin delta on staked history rows only', async () => {
        const api = {
            ...retention(),
            history: vi
                .fn()
                .mockResolvedValue([
                    entry({ duelId: 'win', stake: 100, coinDelta: 100 }),
                    entry({ duelId: 'loss', result: 'LOST', stake: 500, coinDelta: -500 }),
                    entry({ duelId: 'friendly' }),
                ]),
            transactions: noTransactions(),
        };

        render(<Profile player={player} api={api} onOpenSettings={() => {}} />);

        await waitFor(() => expect(screen.getAllByTestId('history-row')).toHaveLength(3));
        const deltas = screen.getAllByTestId('history-delta').map((el) => el.getAttribute('data-amount'));
        expect(deltas).toEqual(['100', '-500']);
    });

    it('lists the latest coin movements with a Ukrainian label per kind', async () => {
        const api = {
            ...retention(),
            history: vi.fn().mockResolvedValue([]),
            transactions: vi
                .fn()
                .mockResolvedValue([tx(200, 'STAKE_PAYOUT'), tx(-100, 'STAKE_ESCROW'), tx(500, 'STARTER')]),
        };

        render(<Profile player={player} api={api} onOpenSettings={() => {}} />);

        await waitFor(() => expect(screen.getAllByTestId('tx-row')).toHaveLength(3));
        const rows = screen.getAllByTestId('tx-row');
        expect(rows.map((row) => row.getAttribute('data-kind'))).toEqual([
            'STAKE_PAYOUT',
            'STAKE_ESCROW',
            'STARTER',
        ]);
        expect(rows[0]?.textContent).toContain(t('profile.tx.STAKE_PAYOUT'));
        expect(rows[1]?.querySelector('[data-amount]')?.getAttribute('data-amount')).toBe('-100');
    });

    it('shows the player, their record and the recent duels', async () => {
        const api = {
            ...retention(),
            history: vi
                .fn()
                .mockResolvedValue([entry({}), entry({ duelId: 'd2', result: 'LOST', moveCount: 5 })]),
            transactions: noTransactions(),
        };

        render(<Profile player={player} api={api} onOpenSettings={() => {}} />);

        expect(screen.getByText('Аліса')).toBeTruthy();
        await waitFor(() => expect(screen.getAllByTestId('history-row')).toHaveLength(2));
        expect(screen.getByTestId('stat-games').textContent).toBe('2');
        expect(screen.getByTestId('stat-wins').textContent).toBe('1');
        expect(screen.getByText(t('profile.moves', { n: 21, moves: 'хід' }))).toBeTruthy();
        expect(screen.getByText(t('profile.moves', { n: 5, moves: 'ходів' }))).toBeTruthy();
    });

    it('sums up games, wins, the win rate and the coins won', async () => {
        const api = {
            ...retention(),
            history: vi
                .fn()
                .mockResolvedValue([
                    entry({ duelId: 'a', stake: 100, coinDelta: 100 }),
                    entry({ duelId: 'b', result: 'LOST', stake: 500, coinDelta: -500 }),
                    entry({ duelId: 'c', stake: 1000, coinDelta: 1000 }),
                    entry({ duelId: 'd', result: 'DRAW' }),
                    entry({ duelId: 'e', result: 'LOST' }),
                    entry({ duelId: 'f', result: 'LOST' }),
                ]),
            transactions: noTransactions(),
        };

        render(<Profile player={player} api={api} onOpenSettings={() => {}} />);

        await waitFor(() => expect(screen.getByTestId('stat-games').textContent).toBe('6'));
        expect(screen.getByTestId('stat-wins').textContent).toBe('2');
        expect(screen.getByTestId('stat-winrate').getAttribute('data-value')).toBe('33');
        expect(screen.getByTestId('stat-winrate').textContent).toBe('33%');
        expect(screen.getByTestId('stat-coins-won').getAttribute('data-amount')).toBe('1100');
    });

    it('shows no win rate before the first game', async () => {
        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([]),
                    transactions: noTransactions(),
                }}
                onOpenSettings={() => {}}
            />,
        );

        await screen.findByText(t('profile.noHistory'));
        expect(screen.getByTestId('stat-winrate').textContent).toBe('—');
    });

    it('explains an empty history', async () => {
        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([]),
                    transactions: noTransactions(),
                }}
                onOpenSettings={() => {}}
            />,
        );

        expect(await screen.findByText(t('profile.noHistory'))).toBeTruthy();
    });

    it('reports a failed load', async () => {
        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockRejectedValue(new Error('boom')),
                    transactions: noTransactions(),
                }}
                onOpenSettings={() => {}}
            />,
        );

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'));
    });

    it('shows the rank badge and how far the XP bar is to the next rank', async () => {
        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([]),
                    transactions: noTransactions(),
                    progress: vi.fn().mockResolvedValue(progressView({ xp: 120, nextRankXp: 300 })),
                }}
                onOpenSettings={() => {}}
            />,
        );

        const badge = await screen.findByTestId('rank-badge');
        expect(badge.getAttribute('data-rank')).toBe('PIDKYDNYI');
        expect(badge.textContent).toBe(t('progress.rank.PIDKYDNYI'));
        const bar = screen.getByTestId('xp-bar');
        expect(bar.getAttribute('data-xp')).toBe('120');
        expect(bar.getAttribute('data-next')).toBe('300');
        expect((bar.querySelector('.fill') as HTMLElement).style.width).toBe('40%');
        expect(bar.textContent).toContain(t('progress.xpBar', { xp: 120, next: 300 }));
    });

    it('fills the XP bar at the top rank', async () => {
        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([]),
                    transactions: noTransactions(),
                    progress: vi
                        .fn()
                        .mockResolvedValue(progressView({ xp: 1700, rank: 'LEHENDA', nextRankXp: null })),
                }}
                onOpenSettings={() => {}}
            />,
        );

        const bar = await screen.findByTestId('xp-bar');
        expect((bar.querySelector('.fill') as HTMLElement).style.width).toBe('100%');
        expect(bar.textContent).toContain(t('progress.xpMax', { xp: 1700 }));
    });

    it('lists the friends leaderboard with the caller marked, or says it is empty', async () => {
        const row = (
            playerId: string,
            displayName: string,
            coinsWon: number,
            you = false,
        ): LeaderboardEntry => ({
            playerId,
            player: { username: playerId, displayName },
            wins: 2,
            coinsWon,
            you,
        });
        const { unmount } = render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([]),
                    transactions: noTransactions(),
                    leaderboard: vi
                        .fn()
                        .mockResolvedValue([row('p2', 'Оля', 600), row('me', 'Аліса', 100, true)]),
                }}
                onOpenSettings={() => {}}
            />,
        );

        await waitFor(() => expect(screen.getAllByTestId('leaderboard-row')).toHaveLength(2));
        const rows = screen.getAllByTestId('leaderboard-row');
        expect(rows.map((el) => el.getAttribute('data-player'))).toEqual(['p2', 'me']);
        expect(rows.map((el) => el.getAttribute('data-you'))).toEqual(['false', 'true']);
        expect(rows[0]?.textContent).toContain('Оля');
        expect(rows[0]?.querySelector('[data-amount]')?.getAttribute('data-amount')).toBe('600');
        expect(rows[0]?.textContent).toContain(t('leaderboard.wins', { n: 2, wins: 'перемоги' }));
        unmount();

        render(
            <Profile
                player={player}
                api={{
                    ...retention(),
                    history: vi.fn().mockResolvedValue([]),
                    transactions: noTransactions(),
                }}
                onOpenSettings={() => {}}
            />,
        );
        expect(await screen.findByText(t('leaderboard.empty'))).toBeTruthy();
    });

    it('shows the Telegram handle when there is one and never the internal tg_ username', () => {
        const api = {
            ...retention(),
            history: vi.fn().mockResolvedValue([]),
            transactions: noTransactions(),
        };
        const { unmount } = render(
            <Profile
                player={{ playerId: 'me', username: 'tg_7', displayName: 'Оля' }}
                api={api}
                onOpenSettings={() => {}}
            />,
        );
        expect(screen.queryByText(/^@/)).toBeNull();
        unmount();

        render(
            <Profile
                player={{ playerId: 'me', username: 'tg_7', displayName: 'Оля', handle: 'olya' }}
                api={api}
                onOpenSettings={() => {}}
            />,
        );
        expect(screen.getByText('@olya')).toBeTruthy();
    });
});
