import { render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../i18n';
import { Lobby } from './Lobby';

const player = { playerId: 'me', username: 'alice', displayName: 'Аліса' };

const renderLobby = () =>
    render(
        <Lobby
            player={player}
            error={undefined}
            wallet={{ balance: 500, dailyBonus: { available: true, amount: 50, streakDay: 1, nextAt: '' } }}
            creating={false}
            onInvite={vi.fn()}
            onQuickMatch={vi.fn()}
            onJoin={vi.fn().mockResolvedValue(undefined)}
            onClaimBonus={vi.fn().mockResolvedValue(undefined)}
            onBonusDue={vi.fn()}
        />,
    );

describe('Lobby', () => {
    it('opens with the wordmark and the balance in one brand strip', () => {
        renderLobby();

        const strip = screen.getByTestId('brand-strip');
        expect(strip.querySelector('.wordmark')?.textContent).toBe(t('app.title'));
        expect(strip.contains(screen.getByTestId('balance'))).toBe(true);
    });

    it('keeps both ways to start a game together in one play panel', () => {
        renderLobby();

        const panel = screen.getByTestId('play-panel');
        expect(panel.contains(screen.getByTestId('quick-match'))).toBe(true);
        expect(panel.contains(screen.getByTestId('invite'))).toBe(true);
    });
});
