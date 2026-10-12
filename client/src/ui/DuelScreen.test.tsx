import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { t } from '../i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { equipped } from '../content/loader';
import { CARD_IDS } from '../content/schema';
import type { PackManifest } from '../content/types';
import { c, view } from '../game/fixtures/views';
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
            player={{ playerId: 'me', username: 'alice' }}
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
        expect(screen.getByRole('status').getAttribute('data-state')).toBe('your-attack');
        expect(openStream).toHaveBeenCalledWith('duel-1', expect.anything());
    });

    it('re-fetches the duel on every nudge and ignores stale answers', async () => {
        const { api, nudge } = setup();
        await waitFor(() =>
            expect(screen.getByRole('status').getAttribute('data-state')).toBe('your-attack'),
        );

        api.duel.mockResolvedValueOnce(view({ version: 2, attacker: 'them' }));
        nudge();
        await waitFor(() =>
            expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack'),
        );

        api.duel.mockResolvedValueOnce(view({ version: 1 }));
        nudge();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack');
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

        await waitFor(() => expect(screen.getByRole('heading', { name: t('duel.result.WON') })).toBeTruthy());
    });

    it.each([
        [{ winner: 'me', loser: 'them', draw: false }, 'WON', '100'],
        [{ winner: 'them', loser: 'me', draw: false }, 'LOST', '-100'],
        [{ draw: true }, 'DRAW', '0'],
    ])('shows the coins a staked duel moved (%j → %s)', async (outcome, result, delta) => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockResolvedValueOnce(
            view({ version: 40, phase: 'FINISHED', stake: 100, outcome: { ...outcome, reason: 'X' } }),
        );
        nudge();

        await waitFor(() => expect(screen.getByTestId('result').getAttribute('data-result')).toBe(result));
        expect(screen.getByTestId('coin-delta').getAttribute('data-delta')).toBe(delta);
    });

    it.each([
        [{ winner: 'me', loser: 'them' }, 'WON'],
        [{ winner: 'them', loser: 'me' }, 'LOST'],
    ])('explains a forfeit (%j → %s)', async (outcome, result) => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockResolvedValueOnce(
            view({ version: 40, phase: 'FINISHED', outcome: { ...outcome, draw: false, reason: 'FORFEIT' } }),
        );
        nudge();

        await waitFor(() => expect(screen.getByText(t(`duel.explainForfeit.${result}`))).toBeTruthy());
    });

    it('explains a forfeit read from the history', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValueOnce(new ApiError(404));
        api.history.mockResolvedValueOnce([
            {
                duelId: 'duel-1',
                result: 'LOST',
                endReason: 'FORFEIT',
                opponentUsername: 'bob',
                stake: 0,
                coinDelta: 0,
            },
        ]);
        nudge();

        await waitFor(() => expect(screen.getByText(t('duel.explainForfeit.LOST'))).toBeTruthy());
    });

    it('shows no coins for a friendly duel', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockResolvedValueOnce(
            view({ version: 40, phase: 'FINISHED', outcome: { winner: 'me', draw: false, reason: 'X' } }),
        );
        nudge();

        await screen.findByTestId('result');
        expect(screen.queryByTestId('coin-delta')).toBeNull();
    });

    it('takes the coin delta from the history when the duel is already gone', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValueOnce(new ApiError(404));
        api.history.mockResolvedValueOnce([
            {
                duelId: 'duel-1',
                result: 'LOST',
                endReason: 'OPPONENT_OUT_OF_CARDS',
                opponentUsername: 'bob',
                stake: 500,
                coinDelta: -500,
            },
        ]);
        nudge();

        await waitFor(() => expect(screen.getByTestId('coin-delta').getAttribute('data-delta')).toBe('-500'));
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

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: t('duel.result.LOST') })).toBeTruthy(),
        );
        expect(screen.getByTestId('result').getAttribute('data-result')).toBe('LOST');
        expect(screen.getByText(t('duel.explain.LOST', { name: 'bob' }))).toBeTruthy();
        fireEvent.click(screen.getByTestId('back-to-lobby'));
        expect(onExit).toHaveBeenCalled();
        expect(close).toHaveBeenCalled();
    });

    it('retries the history when the result is not readable yet instead of giving up', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValue(new ApiError(404));
        api.history
            .mockRejectedValueOnce(new ApiError(429))
            .mockResolvedValueOnce([])
            .mockResolvedValue([
                {
                    duelId: 'duel-1',
                    result: 'WON',
                    endReason: 'OPPONENT_OUT_OF_CARDS',
                    opponentUsername: 'bob',
                },
            ]);
        nudge();

        await waitFor(() => expect(screen.getByTestId('result').getAttribute('data-result')).toBe('WON'), {
            timeout: 5000,
        });
        expect(screen.queryByTestId('duel-gone')).toBeNull();
    }, 10000);

    it('gives up on the history after repeated failures and offers the lobby', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValue(new ApiError(404));
        api.history.mockResolvedValue([]);
        nudge();

        await waitFor(() => expect(screen.getByTestId('duel-gone')).toBeTruthy(), { timeout: 8000 });
        expect(screen.getByRole('alert').textContent).toBe(t('duel.gone'));
    }, 10000);

    it('stops retrying the history once the screen is gone', async () => {
        const { api, nudge, unmount } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockRejectedValue(new ApiError(404));
        api.history.mockResolvedValue([]);
        nudge();
        await waitFor(() => expect(api.history).toHaveBeenCalledTimes(1));

        unmount();
        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(api.history).toHaveBeenCalledTimes(1);
    }, 10000);

    it('calls a draw a draw', async () => {
        const { api, closed } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockRejectedValueOnce(new ApiError(404));
        api.history.mockResolvedValueOnce([
            { duelId: 'duel-1', result: 'DRAW', endReason: 'DRAW', opponentUsername: 'bob' },
        ]);
        closed(404);

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: t('duel.result.DRAW') })).toBeTruthy(),
        );
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

        await waitFor(() =>
            expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack'),
        );
        expect(api.duel).toHaveBeenCalledTimes(2);
    });

    it('retries a failed re-fetch on its own, so a lost nudge cannot freeze the table', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockRejectedValueOnce(new ApiError(429));
        api.duel.mockResolvedValue(view({ version: 7, attacker: 'them' }));

        nudge();

        await waitFor(
            () => expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack'),
            {
                timeout: 4000,
            },
        );
    });
});

describe('DuelScreen with a content pack', () => {
    const KS = c('KING', 'SPADES');
    const JS = c('JACK', 'SPADES');
    const SIX = c('SIX', 'CLUBS');
    const pack: PackManifest = {
        id: 'demo',
        version: 1,
        type: 'DECK',
        name: { uk: 'Демо' },
        cards: Object.fromEntries(CARD_IDS.map((id) => [id, { image: `cards/${id}.svg` }])),
        rules: [
            {
                id: 'sticky',
                on: 'hand_changed',
                if: { handHas: ['KING_OF_SPADES', 'JACK_OF_SPADES'] },
                do: [{ layout: 'stick_together', cards: ['KING_OF_SPADES', 'JACK_OF_SPADES'] }],
            },
            {
                id: 'taunt',
                on: 'card_played',
                if: { side: 'opponent' },
                do: [{ bubble: { uk: 'Тримай!' }, target: 'opponent' }],
            },
        ],
    };
    const handOrder = () =>
        [...document.querySelectorAll('.hand-card')].map((el) => el.getAttribute('data-card'));
    afterEach(() => {
        equipped.value = undefined;
    });

    it('lays out the hand by the equipped pack rules', async () => {
        equipped.value = pack;
        const { api, nudge } = setup();
        api.duel.mockResolvedValue(view({ version: 1, hand: [KS, SIX, JS] }));
        nudge();

        await waitFor(() =>
            expect(handOrder()).toEqual(['KING_OF_SPADES', 'JACK_OF_SPADES', 'SIX_OF_CLUBS']),
        );
        expect(document.querySelector('.hand-card img')?.getAttribute('src')).toContain('/packs/demo/cards/');
    });

    it('applies a pack that finishes loading mid-duel to the hand already on screen', async () => {
        const { api, nudge } = setup();
        api.duel.mockResolvedValue(view({ version: 1, hand: [KS, SIX, JS] }));
        nudge();
        await waitFor(() =>
            expect(handOrder()).toEqual(['KING_OF_SPADES', 'SIX_OF_CLUBS', 'JACK_OF_SPADES']),
        );

        equipped.value = pack;

        await waitFor(() =>
            expect(handOrder()).toEqual(['KING_OF_SPADES', 'JACK_OF_SPADES', 'SIX_OF_CLUBS']),
        );
    });

    it('shows a pack bubble when its rule fires', async () => {
        equipped.value = pack;
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        api.duel.mockResolvedValue(view({ version: 1, attacker: 'them' }));
        nudge();
        await waitFor(() =>
            expect(screen.getByRole('status').getAttribute('data-state')).toBe('waiting-attack'),
        );
        expect(screen.queryByTestId('pack-bubble')).toBeNull();

        api.duel.mockResolvedValue(
            view({ version: 2, attacker: 'them', phase: 'DEFEND', table: [{ attack: SIX }] }),
        );
        nudge();

        await waitFor(() =>
            expect(screen.getByTestId('pack-bubble').getAttribute('data-rule')).toBe('taunt'),
        );
    });
});
