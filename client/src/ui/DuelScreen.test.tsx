import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { view } from '../game/fixtures/views';
import { resolveTelegram } from '../telegram/webapp';
import { DuelScreen, type StreamOpener } from './DuelScreen';

type StreamCallbacks = Parameters<StreamOpener>[1];

function setup() {
    const api = {
        duel: vi.fn().mockResolvedValue(view()),
        move: vi.fn(),
        history: vi.fn().mockResolvedValue([]),
        activeDuels: vi.fn().mockResolvedValue([{ duelId: 'duel-1', opponentUsername: 'bob' }]),
    };
    let stream: StreamCallbacks | undefined;
    const close = vi.fn();
    const openStream = vi.fn((_id: string, options: StreamCallbacks) => {
        stream = options;
        return close;
    });
    const onExit = vi.fn();
    const utils = render(
        <DuelScreen
            duelId="duel-1"
            api={api}
            telegram={resolveTelegram({})}
            openStream={openStream}
            onExit={onExit}
        />,
    );
    return {
        api,
        openStream,
        close,
        onExit,
        nudge: () => stream?.onNudge(),
        closed: (s: number) => stream?.onClosed?.(s),
        ...utils,
    };
}

describe('DuelScreen', () => {
    it('renders the duel with the opponent name and subscribes to its stream', async () => {
        const { openStream } = setup();

        await waitFor(() => expect(screen.getByText('bob')).toBeTruthy());
        expect(screen.getByRole('status').textContent).toBe('Your attack');
        expect(openStream).toHaveBeenCalledWith('duel-1', expect.anything());
    });

    it('re-fetches the duel on every nudge and ignores stale answers', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Your attack'));

        api.duel.mockResolvedValueOnce(view({ version: 2, attacker: 'them' }));
        nudge();
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Waiting for bob to attack'));

        api.duel.mockResolvedValueOnce(view({ version: 1 }));
        nudge();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(screen.getByRole('status').textContent).toBe('Waiting for bob to attack');
    });

    it('shows the result when the duel it reads has finished', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockResolvedValueOnce(
            view({
                version: 40,
                phase: 'FINISHED',
                outcome: { winner: 'me', loser: 'them', draw: false, reason: 'OPPONENT_OUT_OF_CARDS' },
            }),
        );
        nudge();

        await waitFor(() => expect(screen.getByRole('heading', { name: 'You won' })).toBeTruthy());
    });

    it('falls back to the history once the finished duel is gone, and goes back to start', async () => {
        const { api, nudge, onExit, close } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValueOnce(new ApiError(404));
        api.history.mockResolvedValueOnce([
            { duelId: 'other', result: 'WON' },
            { duelId: 'duel-1', result: 'LOST', endReason: 'OPPONENT_OUT_OF_CARDS', opponentUsername: 'bob' },
        ]);
        nudge();

        await waitFor(() => expect(screen.getByRole('heading', { name: 'You lost' })).toBeTruthy());
        expect(screen.getByText(/bob got rid of all their cards/i)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
        expect(onExit).toHaveBeenCalled();
        expect(close).toHaveBeenCalled();
    });

    it('calls a draw a draw', async () => {
        const { api, closed } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValueOnce(new ApiError(404));
        api.history.mockResolvedValueOnce([
            { duelId: 'duel-1', result: 'DRAW', endReason: 'DRAW', opponentUsername: 'bob' },
        ]);
        closed(404);

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Draw' })).toBeTruthy());
    });

    it('coalesces a burst of nudges into one follow-up fetch', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockClear();
        let release: (value: unknown) => void = () => {};
        api.duel.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
        api.duel.mockResolvedValue(view({ version: 5, attacker: 'them' }));

        nudge();
        nudge();
        nudge();
        nudge();
        release(view({ version: 4 }));

        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Waiting for bob to attack'));
        expect(api.duel).toHaveBeenCalledTimes(2);
    });

    it('retries a failed re-fetch on its own, so a lost nudge cannot freeze the table', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockRejectedValueOnce(new ApiError(429));
        api.duel.mockResolvedValue(view({ version: 7, attacker: 'them' }));

        nudge();

        await waitFor(
            () => expect(screen.getByRole('status').textContent).toBe('Waiting for bob to attack'),
            {
                timeout: 4000,
            },
        );
    });
});
