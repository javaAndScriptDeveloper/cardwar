import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { t } from '../i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { ChallengeView, DuelEvent, DuelSummary, DuelView } from '../api/types';
import { loadout } from '../state/loadout';
import { equipped } from '../content/loader';
import { CARD_IDS } from '../content/schema';
import type { PackManifest } from '../content/types';
import { c, view } from '../game/fixtures/views';
import { resolveTelegram } from '../telegram/webapp';
import { DuelScreen, type StreamOpener } from './DuelScreen';

type StreamCallbacks = Parameters<StreamOpener>[1];

function setup(
    options: {
        first?: DuelView;
        active?: Partial<DuelSummary>[];
        photoUrl?: string;
        extraApi?: Record<string, unknown>;
        onRematchSent?: (invite: unknown, name: string) => void;
        onDuel?: (duelId: string) => void;
    } = {},
) {
    const api = {
        ...(options.extraApi ?? {}),
        duel: vi.fn().mockResolvedValue(options.first ?? view()),
        move: vi.fn(),
        history: vi.fn().mockResolvedValue([]),
        activeDuels: vi
            .fn()
            .mockResolvedValue(options.active ?? [{ duelId: 'duel-1', opponentUsername: 'bob' }]),
        emote: vi.fn().mockResolvedValue(undefined),
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
            player={{
                playerId: 'me',
                username: 'alice',
                ...(options.photoUrl !== undefined && { photoUrl: options.photoUrl }),
            }}
            api={api}
            telegram={resolveTelegram({})}
            openStream={openStream}
            onExit={onExit}
            {...(options.onRematchSent && { onRematchSent: options.onRematchSent })}
            {...(options.onDuel && { onDuel: options.onDuel })}
        />,
    );
    return {
        api,
        openStream,
        close,
        onExit,
        nudge: () => stream?.onNudge(),
        event: (event: DuelEvent) => stream?.onNudge(event),
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

    it("shows the opponent's Telegram name and photo from the view", async () => {
        const { api } = setup({
            first: view({
                opponentProfile: {
                    username: 'tg_7',
                    displayName: 'Оля К',
                    handle: 'olya',
                    photoUrl: 'https://t.me/i/userpic/320/olya.svg',
                },
            }),
            // An older server's summary has no display name: it must not undo the view's profile.
            active: [{ duelId: 'duel-1', opponentUsername: 'tg_7' }],
        });

        await waitFor(() => expect(screen.getByText('Оля К')).toBeTruthy());
        await waitFor(() => expect(api.activeDuels).toHaveBeenCalled());
        await Promise.resolve();
        expect(screen.getByText('Оля К')).toBeTruthy();
        expect(screen.getByTestId('opponent-avatar').getAttribute('src')).toBe(
            'https://t.me/i/userpic/320/olya.svg',
        );
    });

    it('shows the display name and photo from the active-duel summary until the view has a profile', async () => {
        setup({
            active: [
                {
                    duelId: 'duel-1',
                    opponentUsername: 'tg_7',
                    opponentDisplayName: 'Оля',
                    opponentPhotoUrl: 'https://t.me/i/userpic/320/olya.svg',
                },
            ],
        });

        await waitFor(() => expect(screen.getByText('Оля')).toBeTruthy());
        expect(screen.getByTestId('opponent-avatar').getAttribute('src')).toBe(
            'https://t.me/i/userpic/320/olya.svg',
        );
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
            {
                duelId: 'duel-1',
                result: 'LOST',
                endReason: 'OPPONENT_OUT_OF_CARDS',
                opponentUsername: 'tg_7',
                opponentDisplayName: 'bob',
            },
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
    // Sorting alone puts J, Q, K of spades in a row; the queen is what the sticky rule has to move past.
    const QS = c('QUEEN', 'SPADES');
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
        api.duel.mockResolvedValue(view({ version: 1, hand: [KS, SIX, QS, JS] }));
        nudge();

        await waitFor(() =>
            expect(handOrder()).toEqual([
                'SIX_OF_CLUBS',
                'KING_OF_SPADES',
                'JACK_OF_SPADES',
                'QUEEN_OF_SPADES',
            ]),
        );
        expect(document.querySelector('.hand-card img')?.getAttribute('src')).toContain('/packs/demo/cards/');
    });

    it('applies a pack that finishes loading mid-duel to the hand already on screen', async () => {
        const { api, nudge } = setup();
        api.duel.mockResolvedValue(view({ version: 1, hand: [KS, SIX, QS, JS] }));
        nudge();
        await waitFor(() =>
            expect(handOrder()).toEqual([
                'SIX_OF_CLUBS',
                'JACK_OF_SPADES',
                'QUEEN_OF_SPADES',
                'KING_OF_SPADES',
            ]),
        );

        equipped.value = pack;

        await waitFor(() =>
            expect(handOrder()).toEqual([
                'SIX_OF_CLUBS',
                'KING_OF_SPADES',
                'JACK_OF_SPADES',
                'QUEEN_OF_SPADES',
            ]),
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

describe('DuelScreen cosmetics and emotes', () => {
    afterEach(() => {
        loadout.value = undefined;
        equipped.value = undefined;
    });

    it("draws your loadout and the opponent's cosmetics at the table", async () => {
        loadout.value = { deck: 'classic', cardBack: 'sunflower', table: 'night', frame: 'gold', emotes: [] };
        const { api, nudge } = setup();
        api.duel.mockResolvedValue(
            view({ version: 1, opponentCosmetics: { cardBack: 'trident', frame: 'blue-yellow' } }),
        );
        nudge();

        await waitFor(() =>
            expect(screen.getByTestId('opponent-fan').getAttribute('data-back')).toBe('trident'),
        );
        expect(screen.getByTestId('felt').getAttribute('data-table')).toBe('night');
        expect(screen.getByTestId('talon').getAttribute('data-back')).toBe('sunflower');
        expect(screen.getByTestId('opponent-frame').getAttribute('data-frame')).toBe('blue-yellow');
        expect(screen.getByTestId('you-frame').getAttribute('data-frame')).toBe('gold');
    });

    it('throws an owned emote from the tray', async () => {
        loadout.value = { deck: 'classic', cardBack: 'classic', table: 'green', emotes: ['like', 'fire'] };
        const { api } = setup();

        fireEvent.click(await screen.findByTestId('emote-tray'));
        fireEvent.click(screen.getByTestId('emote-fire'));

        await waitFor(() => expect(api.emote).toHaveBeenCalledWith('duel-1', 'emote-fire'));
        expect(screen.queryByTestId('emote-fire')).toBeNull();
    });

    it('offers no tray without owned emotes', async () => {
        setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        expect(screen.queryByTestId('emote-tray')).toBeNull();
    });

    it('says so when emotes come too fast', async () => {
        loadout.value = { deck: 'classic', cardBack: 'classic', table: 'green', emotes: ['like'] };
        const { api } = setup();
        api.emote.mockRejectedValue(new ApiError(400, { reason: 'EMOTE_TOO_FAST' }));

        fireEvent.click(await screen.findByTestId('emote-tray'));
        fireEvent.click(screen.getByTestId('emote-like'));

        const toast = await screen.findByRole('alert');
        expect(toast.getAttribute('data-reason')).toBe('EMOTE_TOO_FAST');
        expect(toast.textContent).toBe(t('duel.emoteTooFast'));
    });

    it("floats an incoming emote over its sender's avatar without re-reading the duel", async () => {
        const { api, event } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        await waitFor(() => expect(api.duel).toHaveBeenCalledTimes(1));

        event({ type: 'EMOTE', duelId: 'duel-1', player: 'them', emote: 'clown' });

        const bubble = await screen.findByTestId('emote-bubble');
        expect(bubble.getAttribute('data-emote')).toBe('clown');
        expect(bubble.getAttribute('data-from')).toBe('opponent');
        expect(bubble.textContent).toBe('🤡');
        expect(api.duel).toHaveBeenCalledTimes(1);

        event({ type: 'EMOTE', duelId: 'duel-1', player: 'me', emote: 'like' });
        await waitFor(() =>
            expect(screen.getAllByTestId('emote-bubble').map((el) => el.getAttribute('data-from'))).toContain(
                'you',
            ),
        );
    });

    it('feeds emote_received to the equipped pack', async () => {
        equipped.value = {
            id: 'demo',
            version: 1,
            type: 'DECK',
            name: { uk: 'Демо' },
            cards: Object.fromEntries(CARD_IDS.map((id) => [id, { image: `cards/${id}.svg` }])),
            rules: [
                {
                    id: 'answer',
                    on: 'emote_received',
                    if: { side: 'opponent' },
                    do: [{ bubble: { uk: 'Ой!' }, target: 'opponent' }],
                },
            ],
        };
        const { event } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());

        event({ type: 'EMOTE', duelId: 'duel-1', player: 'them', emote: 'laugh' });

        await waitFor(() =>
            expect(screen.getByTestId('pack-bubble').getAttribute('data-rule')).toBe('answer'),
        );
    });
});

describe('DuelScreen rematch', () => {
    const finished = view({
        version: 40,
        phase: 'FINISHED',
        stake: 100,
        opponent: 'them',
        outcome: { winner: 'me', loser: 'them', draw: false, reason: 'OPPONENT_OUT_OF_CARDS' },
    });

    function setupRematch(challenges: ChallengeView[] = []) {
        const social = {
            friends: vi.fn().mockResolvedValue([
                {
                    playerId: 'them',
                    username: 'bob',
                    displayName: 'Боб',
                    played: 3,
                    won: 2,
                    lost: 1,
                    lastPlayedAt: 'x',
                },
            ]),
            challenge: vi
                .fn()
                .mockResolvedValue({ inviteId: 'inv-7', status: 'PENDING', expiresAt: 'x', stake: 100 }),
            challenges: vi.fn().mockResolvedValue(challenges),
            acceptInvite: vi.fn().mockResolvedValue(view({ duelId: 'duel-2' })),
        };
        const onRematchSent = vi.fn();
        const onDuel = vi.fn();
        const utils = setup({ extraApi: social, onRematchSent, onDuel });
        return { ...utils, social, onRematchSent, onDuel };
    }

    it('shows the running score and sends a rematch challenge at the same stake', async () => {
        const { api, nudge, social, onRematchSent } = setupRematch();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockResolvedValueOnce(finished);
        nudge();

        await waitFor(() => expect(screen.getByTestId('result-record').textContent).toBe('2:1'));
        fireEvent.click(screen.getByTestId('rematch'));

        await waitFor(() => expect(social.challenge).toHaveBeenCalledWith('them', 100));
        await waitFor(() =>
            expect(onRematchSent).toHaveBeenCalledWith(
                expect.objectContaining({ inviteId: 'inv-7' }),
                expect.any(String),
            ),
        );
    });

    it("accepts the opponent's rematch straight into the new duel", async () => {
        const { api, nudge, social, onDuel } = setupRematch([
            {
                inviteId: 'inv-9',
                from: { playerId: 'them', username: 'bob', displayName: 'Боб' },
                stake: 100,
                expiresAt: 'x',
            },
        ]);
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockResolvedValueOnce(finished);
        nudge();

        fireEvent.click(await screen.findByTestId('accept-rematch'));

        await waitFor(() => expect(social.acceptInvite).toHaveBeenCalledWith('inv-9'));
        await waitFor(() => expect(onDuel).toHaveBeenCalledWith('duel-2'));
    });

    it('offers no rematch to a client without the social calls', async () => {
        const { api, nudge } = setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        api.duel.mockResolvedValueOnce(finished);
        nudge();

        await screen.findByTestId('result');
        expect(screen.queryByTestId('rematch')).toBeNull();
    });

    it('explains the move clock once, on the first own turn', async () => {
        localStorage.removeItem('cardwar.hint.clock');
        const first = setup();
        const hint = await screen.findByRole('alert');
        expect(hint.getAttribute('data-reason')).toBe('hint');
        first.unmount();

        setup();
        await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
