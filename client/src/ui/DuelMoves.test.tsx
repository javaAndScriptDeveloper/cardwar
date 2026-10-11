import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
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

const tap = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));

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

        await tap('Six of Clubs');

        expect(api.move).toHaveBeenCalledWith('duel-1', { type: 'ATTACK', card: c('SIX', 'CLUBS') });
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('bob is defending'));
        expect(telegram.haptic).toHaveBeenCalledWith('tap');
    });

    it('defends the only open attack without asking for a target', async () => {
        const { api } = setup(
            view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SEVEN', 'SPADES') }] }),
        );
        api.move.mockResolvedValue(view({ version: 1, attacker: 'them' }));

        await tap('Nine of Spades');

        expect(api.move).toHaveBeenCalledWith('duel-1', {
            type: 'DEFEND',
            attackCard: c('SEVEN', 'SPADES'),
            card: c('NINE', 'SPADES'),
        });
    });

    it('defends the selected target when several attacks are open', async () => {
        const { api } = setup(twoOpenAttacks);
        api.move.mockResolvedValue({ ...twoOpenAttacks, version: 1 });

        await tap('Eight of Diamonds');
        expect(screen.getByRole('button', { name: 'Eight of Diamonds' }).getAttribute('aria-pressed')).toBe(
            'true',
        );
        await tap('Ace of Hearts');

        expect(api.move).toHaveBeenCalledWith('duel-1', {
            type: 'DEFEND',
            attackCard: c('EIGHT', 'DIAMONDS'),
            card: c('ACE', 'HEARTS'),
        });
    });

    it('infers the target when the card beats exactly one open attack', async () => {
        const { api } = setup(twoOpenAttacks);
        api.move.mockResolvedValue({ ...twoOpenAttacks, version: 1 });

        await tap('Nine of Spades');

        expect(api.move).toHaveBeenCalledWith(
            'duel-1',
            expect.objectContaining({ attackCard: c('SEVEN', 'SPADES') }),
        );
    });

    it('asks for a target when the card could beat several', async () => {
        const { api } = setup(twoOpenAttacks);

        await tap('Ace of Hearts');

        expect(api.move).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toMatch(/tap the card you want to beat/i);
    });

    it('takes and ends the attack with the buttons', async () => {
        const { api } = setup(
            view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SEVEN', 'SPADES') }] }),
        );
        api.move.mockResolvedValue(
            view({ version: 1, table: [{ attack: c('SIX', 'SPADES'), defence: c('NINE', 'SPADES') }] }),
        );

        await tap('Take');
        expect(api.move).toHaveBeenLastCalledWith('duel-1', { type: 'TAKE' });
        await tap('End attack');
        expect(api.move).toHaveBeenLastCalledWith('duel-1', { type: 'END_ATTACK' });
    });

    it('explains an illegal move, keeps the state and buzzes', async () => {
        const waiting = view({ attacker: 'them' });
        const { api, telegram } = setup(waiting);
        api.move.mockRejectedValue(
            new ApiError(400, { reason: 'NOT_YOUR_TURN', detail: 'it is not your move' }),
        );

        await tap('Six of Clubs');

        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Not your turn.'));
        expect(screen.getByRole('status').textContent).toBe('Waiting for bob to attack');
        expect(telegram.haptic).toHaveBeenCalledWith('error');
    });

    it('re-fetches after a conflict instead of retrying', async () => {
        const { api } = setup(view());
        api.move.mockRejectedValue(new ApiError(409));
        api.duel.mockResolvedValue(view({ version: 3, attacker: 'them' }));

        await tap('Six of Clubs');

        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Waiting for bob to attack'));
        expect(api.move).toHaveBeenCalledTimes(1);
    });

    it('re-reads the duel and says so when a move is lost to the network', async () => {
        const { api } = setup(view());
        api.move.mockRejectedValue(new ApiError(0, { detail: 'Network unavailable' }));
        api.duel.mockResolvedValue(
            view({ version: 1, phase: 'DEFEND', table: [{ attack: c('SIX', 'CLUBS') }] }),
        );

        await tap('Six of Clubs');

        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/connection/i));
        // The move may have reached the server before the connection dropped; the re-read shows whether it did.
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('bob is defending'));
    });

    it('asks to slow down when the server throttles a move', async () => {
        const { api } = setup(view());
        api.move.mockRejectedValue(new ApiError(429, { detail: 'Rate limit exceeded. Try again shortly.' }));

        await tap('Six of Clubs');

        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/slow down/i));
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

        await tap('Six of Clubs');

        await waitFor(() => expect(screen.getByRole('heading', { name: 'You won' })).toBeTruthy());
    });
});
