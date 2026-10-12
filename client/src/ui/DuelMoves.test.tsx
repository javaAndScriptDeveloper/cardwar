import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { t } from '../i18n';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { DuelView } from '../api/types';
import { c, view } from '../game/fixtures/views';
import { resolveTelegram } from '../telegram/webapp';
import { DuelScreen } from './DuelScreen';

function setup(start: DuelView) {
    const api = {
        duel: vi.fn().mockResolvedValue(start),
        move: vi.fn(),
        history: vi.fn().mockResolvedValue([]),
        activeDuels: vi.fn().mockResolvedValue([{ duelId: 'duel-1', opponentUsername: 'bob' }]),
    };
    const telegram = { ...resolveTelegram({}), haptic: vi.fn() };
    render(
        <DuelScreen
            duelId="duel-1"
            api={api}
            telegram={telegram}
            openStream={() => () => {}}
            onExit={vi.fn()}
        />,
    );
    return { api, telegram };
}

/** Taps a hand card or table pair by card id, or an action by its testid. */
const tap = async (target: string) => {
    const selector = /^[A-Z]+_OF_[A-Z]+$/.test(target)
        ? `.hand-card[data-card="${target}"], .pair[data-attack="${target}"]`
        : `[data-testid="${target}"]`;
    await waitFor(() => expect(document.querySelector(selector)).toBeTruthy());
    fireEvent.click(document.querySelector(selector) as HTMLElement);
};

const twoOpenAttacks = view({
    attacker: 'them',
    phase: 'DEFEND',
    hand: [c('SIX', 'CLUBS'), c('NINE', 'SPADES'), c('ACE', 'HEARTS')],
    table: [{ attack: c('SEVEN', 'SPADES') }, { attack: c('EIGHT', 'DIAMONDS') }],
});

describe('moves', () => {
    it('attacks with a tapped card and shows the returned view', async () => {
        const { api, telegram } = setup(view());
        api.move.mockResolvedValue(
            view({ version: 1, phase: 'DEFEND', table: [{ attack: c('SIX', 'CLUBS') }] }),
        );

        await tap('SIX_OF_CLUBS');

        expect(api.move).toHaveBeenCalledWith('duel-1', { type: 'ATTACK', card: c('SIX', 'CLUBS') });
        await waitFor(() => expect(screen.getByRole('status').getAttribute('data-state')).toBe('defending'));
        expect(telegram.haptic).toHaveBeenCalledWith('tap');
    });

    it('defends the only open attack without asking for a target', async () => {
        const { api } = setup(
            view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SEVEN', 'SPADES') }] }),
        );
        api.move.mockResolvedValue(view({ version: 1, attacker: 'them' }));

        await tap('NINE_OF_SPADES');

        expect(api.move).toHaveBeenCalledWith('duel-1', {
            type: 'DEFEND',
            attackCard: c('SEVEN', 'SPADES'),
            card: c('NINE', 'SPADES'),
        });
    });

    it('defends the selected target when several attacks are open', async () => {
        const { api } = setup(twoOpenAttacks);
        api.move.mockResolvedValue({ ...twoOpenAttacks, version: 1 });

        await tap('EIGHT_OF_DIAMONDS');
        expect(
            (document.querySelector('.pair[data-attack="EIGHT_OF_DIAMONDS"]') as HTMLElement).getAttribute(
                'aria-pressed',
            ),
        ).toBe('true');
        await tap('ACE_OF_HEARTS');

        expect(api.move).toHaveBeenCalledWith('duel-1', {
            type: 'DEFEND',
            attackCard: c('EIGHT', 'DIAMONDS'),
            card: c('ACE', 'HEARTS'),
        });
    });

    it('infers the target when the card beats exactly one open attack', async () => {
        const { api } = setup(twoOpenAttacks);
        api.move.mockResolvedValue({ ...twoOpenAttacks, version: 1 });

        await tap('NINE_OF_SPADES');

        expect(api.move).toHaveBeenCalledWith(
            'duel-1',
            expect.objectContaining({ attackCard: c('SEVEN', 'SPADES') }),
        );
    });

    it('asks for a target when the card could beat several', async () => {
        const { api } = setup(twoOpenAttacks);

        await tap('ACE_OF_HEARTS');

        expect(api.move).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').getAttribute('data-reason')).toBe('pick-target');
    });

    it('takes and ends the attack with the buttons', async () => {
        const { api } = setup(
            view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SEVEN', 'SPADES') }] }),
        );
        api.move.mockResolvedValue(
            view({ version: 1, table: [{ attack: c('SIX', 'SPADES'), defence: c('NINE', 'SPADES') }] }),
        );

        await tap('take');
        expect(api.move).toHaveBeenLastCalledWith('duel-1', { type: 'TAKE' });
        await tap('end-attack');
        expect(api.move).toHaveBeenLastCalledWith('duel-1', { type: 'END_ATTACK' });
    });

    it('explains an illegal move, keeps the state and buzzes', async () => {
        const waiting = view({ attacker: 'them' });
        const { api, telegram } = setup(waiting);
        api.move.mockRejectedValue(
            new ApiError(400, { reason: 'NOT_YOUR_TURN', detail: 'it is not your move' }),
        );

        await tap('SIX_OF_CLUBS');

        await waitFor(() =>
            expect(screen.getByRole('alert').getAttribute('data-reason')).toBe('NOT_YOUR_TURN'),
        );
        expect(screen.getByRole('alert').textContent).toBe(t('reason.NOT_YOUR_TURN'));
        expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack');
        expect(telegram.haptic).toHaveBeenCalledWith('error');
    });

    it('re-fetches after a conflict instead of retrying', async () => {
        const { api } = setup(view());
        api.move.mockRejectedValue(new ApiError(409));
        api.duel.mockResolvedValue(view({ version: 3, attacker: 'them' }));

        await tap('SIX_OF_CLUBS');

        await waitFor(() =>
            expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack'),
        );
        expect(api.move).toHaveBeenCalledTimes(1);
    });

    it('re-reads the duel and says so when a move is lost to the network', async () => {
        const { api } = setup(view());
        api.move.mockRejectedValue(new ApiError(0, { detail: 'Network unavailable' }));
        api.duel.mockResolvedValue(
            view({ version: 1, phase: 'DEFEND', table: [{ attack: c('SIX', 'CLUBS') }] }),
        );

        await tap('SIX_OF_CLUBS');

        await waitFor(() => expect(screen.getByRole('alert').getAttribute('data-reason')).toBe('network'));
        // The move may have reached the server before the connection dropped; the re-read shows whether it did.
        await waitFor(() => expect(screen.getByRole('status').getAttribute('data-state')).toBe('defending'));
    });

    it('asks to slow down when the server throttles a move', async () => {
        const { api } = setup(view());
        api.move.mockRejectedValue(new ApiError(429, { detail: 'Rate limit exceeded. Try again shortly.' }));

        await tap('SIX_OF_CLUBS');

        await waitFor(() => expect(screen.getByRole('alert').getAttribute('data-reason')).toBe('throttled'));
    });

    it('shows the result straight away when its own move ends the duel', async () => {
        const { api } = setup(view({ hand: [c('SIX', 'CLUBS')], talonCount: 0 }));
        api.move.mockResolvedValue(
            view({
                version: 9,
                phase: 'FINISHED',
                hand: [],
                outcome: { winner: 'me', loser: 'them', draw: false, reason: 'OPPONENT_OUT_OF_CARDS' },
            }),
        );

        await tap('SIX_OF_CLUBS');

        await waitFor(() => expect(screen.getByRole('heading', { name: t('duel.result.WON') })).toBeTruthy());
    });
});
