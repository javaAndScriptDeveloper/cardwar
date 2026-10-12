import { render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { DuelHistoryEntry } from '../../api/types';
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
    ...overrides,
});

describe('Profile', () => {
    it('shows the player, their record and the recent duels', async () => {
        const api = {
            history: vi
                .fn()
                .mockResolvedValue([entry({}), entry({ duelId: 'd2', result: 'LOST', moveCount: 5 })]),
        };

        render(<Profile player={player} api={api} onOpenSettings={() => {}} />);

        expect(screen.getByText('Аліса')).toBeTruthy();
        await waitFor(() => expect(screen.getAllByTestId('history-row')).toHaveLength(2));
        expect(screen.getByTestId('stat-games').textContent).toBe('2');
        expect(screen.getByTestId('stat-wins').textContent).toBe('1');
        expect(screen.getByText(t('profile.moves', { n: 21, moves: 'хід' }))).toBeTruthy();
        expect(screen.getByText(t('profile.moves', { n: 5, moves: 'ходів' }))).toBeTruthy();
    });

    it('explains an empty history', async () => {
        render(
            <Profile
                player={player}
                api={{ history: vi.fn().mockResolvedValue([]) }}
                onOpenSettings={() => {}}
            />,
        );

        expect(await screen.findByText(t('profile.noHistory'))).toBeTruthy();
    });

    it('reports a failed load', async () => {
        render(
            <Profile
                player={player}
                api={{ history: vi.fn().mockRejectedValue(new Error('boom')) }}
                onOpenSettings={() => {}}
            />,
        );

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'));
    });
});
