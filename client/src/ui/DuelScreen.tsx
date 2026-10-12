import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { DuelStreamOptions } from '../api/events';
import type { DuelView, MoveRequest } from '../api/types';
import { audio } from '../audio';
import type { SignedInPlayer } from '../auth/session';
import { type Card, cardId, sameCard } from '../game/cards';
import { diffViews, type Result, resultOf, type TableEvent } from '../game/diff';
import { animate } from '../motion';
import { settings } from '../state/settings';
import { reasonMessage } from '../game/reasons';
import { role, targetsFor, undefendedAttacks } from '../game/selectors';
import { t } from '../i18n';
import type { HapticKind, Telegram } from '../telegram/webapp';
import { describeError } from './errors';
import { CoinAmount } from './kit';
import type { ClockWarning } from './MoveTimer';
import { Table } from './Table';

export type DuelApi = Pick<ApiClient, 'duel' | 'move' | 'history' | 'activeDuels'>;
export type StreamOpener = (
    duelId: string,
    options: Omit<DuelStreamOptions, 'fetchImpl' | 'headers'>,
) => () => void;

interface Props {
    duelId: string;
    player: SignedInPlayer;
    api: DuelApi;
    telegram: Telegram;
    openStream: StreamOpener;
    onExit: () => void;
}

type State =
    | { kind: 'loading' }
    | { kind: 'playing'; view: DuelView }
    /** `coins` is the caller's signed net for a staked duel, undefined for a friendly one. */
    | { kind: 'over'; result: Result; coins: number | undefined }
    | { kind: 'gone'; message: string };

/** Delay before re-trying a re-fetch that failed (429 or no network). */
const RETRY_MS = 1500;
/** How many times the history is read for a finished duel before the duel is declared gone. */
const HISTORY_ATTEMPTS = 4;

/** What a finished view moved for the caller: the winner takes the pot (net +stake), a draw refunds both. */
function coinsOf(view: DuelView, result: Result): number | undefined {
    if (!(view.stake > 0)) {
        return undefined;
    }
    return result.result === 'WON' ? view.stake : result.result === 'LOST' ? -view.stake : 0;
}

function explain(result: Result, opponentName: string): string {
    return t(`duel.explain.${result.result}`, { name: opponentName });
}

/**
 * One duel, live. The event stream is only a nudge: every event re-fetches the caller's view over REST, and a view
 * older than the one on screen is ignored, so out-of-order answers never move the table backwards.
 *
 * <p>The backend deletes a duel the moment it finishes. Whoever did not make the last move therefore gets a 404 on
 * the re-fetch, and the result comes from their history instead.
 */
export function DuelScreen({ duelId, player, api, telegram, openStream, onExit }: Props) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [opponentName, setOpponentName] = useState(t('duel.opponent'));
    const version = useRef(-1);
    const previousView = useRef<DuelView>(undefined);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    // Vibration is a setting; every haptic goes through here so the toggle means what it says.
    const buzz = useCallback(
        (kind: HapticKind) => {
            if (settings.value.haptics) {
                telegram.haptic(kind);
            }
        },
        [telegram],
    );
    // Your own clock running low: the turn chime at ten seconds, a buzz at five. The server moves for you at zero.
    const clockWarning = useCallback(
        (warning: ClockWarning) => {
            if (warning === 'ten') {
                audio.play('turn');
            } else {
                buzz('warning');
            }
        },
        [buzz],
    );
    const [lastEvents, setLastEvents] = useState<TableEvent[]>([]);
    const tableRef = useRef<HTMLDivElement>(null);
    const closeStream = useRef<() => void>(() => {});

    /**
     * The result of a finished duel, from the history. Right after the last move the row may not be readable yet
     * (the read can be throttled in a fast game, or the connection may blip), so a few attempts are made before
     * declaring the duel gone.
     */
    const finishFromHistory = useCallback(async () => {
        for (let attempt = 1; mounted.current; attempt++) {
            try {
                const entry = (await api.history()).find((row) => row.duelId === duelId);
                if (!mounted.current) {
                    return;
                }
                if (entry) {
                    setOpponentName(entry.opponentUsername);
                    setState({
                        kind: 'over',
                        result: { result: entry.result, reason: entry.endReason },
                        coins: entry.stake > 0 ? entry.coinDelta : undefined,
                    });
                    // This player did not make the last move, so no view carried the finish: react to it here.
                    react({ type: 'duel_finished', result: entry.result }, buzz);
                    return;
                }
                if (attempt >= HISTORY_ATTEMPTS) {
                    setState({ kind: 'gone', message: t('duel.gone') });
                    return;
                }
            } catch (error) {
                if (attempt >= HISTORY_ATTEMPTS) {
                    setState({
                        kind: 'gone',
                        message: t('duel.loadResult', { error: describeError(error) }),
                    });
                    return;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
    }, [api, duelId, buzz]);

    const show = useCallback(
        (view: DuelView) => {
            if (view.version < version.current) {
                return;
            }
            version.current = view.version;
            const events = diffViews(previousView.current, view);
            previousView.current = view;
            // Sounds and haptics need no element, so they fire here; animations wait for the render (see below).
            for (const event of events) {
                react(event, buzz);
            }
            setLastEvents(events);
            if (view.phase === 'FINISHED') {
                closeStream.current();
                const result = resultOf(view);
                setState({ kind: 'over', result, coins: coinsOf(view, result) });
            } else {
                setState({ kind: 'playing', view });
            }
        },
        [buzz],
    );

    // Animate what the last view changed, once its elements exist.
    useEffect(() => {
        const root = tableRef.current;
        if (!root || lastEvents.length === 0) {
            return;
        }
        for (const event of lastEvents) {
            void animateEvent(root, event);
        }
    }, [lastEvents]);

    // One re-fetch in flight at a time. A move produces a burst of events, and each is a nudge; they collapse into
    // at most one follow-up fetch, which keeps a fast game well inside the per-player rate limit.
    const inFlight = useRef(false);
    const again = useRef(false);
    const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const fetchOnce = useCallback(async (): Promise<boolean> => {
        try {
            show(await api.duel(duelId));
            return true;
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                closeStream.current();
                await finishFromHistory();
                return true;
            }
            return false;
        }
    }, [api, duelId, show, finishFromHistory]);

    const refresh = useCallback(async (): Promise<void> => {
        if (inFlight.current) {
            again.current = true;
            return;
        }
        inFlight.current = true;
        clearTimeout(retryTimer.current);
        let ok: boolean;
        try {
            do {
                again.current = false;
                ok = await fetchOnce();
            } while (again.current && ok);
        } finally {
            inFlight.current = false;
        }
        if (!ok) {
            // Throttled or offline. The nudge that brought us here will not come again, so retry rather than leave a
            // stale table waiting for an event that already happened.
            retryTimer.current = setTimeout(() => void refresh(), RETRY_MS);
        }
    }, [fetchOnce]);

    useEffect(() => () => clearTimeout(retryTimer.current), []);

    useEffect(() => {
        void refresh();
        api.activeDuels()
            .then((active) => {
                const mine = active.find((summary) => summary.duelId === duelId);
                if (mine) {
                    setOpponentName(mine.opponentUsername);
                }
            })
            .catch(() => {});
        closeStream.current = openStream(duelId, {
            onNudge: () => void refresh(),
            onClosed: () => void refresh(),
        });
        return () => closeStream.current();
    }, [api, duelId, openStream, refresh]);

    const [selectedTarget, setSelectedTarget] = useState<Card>();
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<{ text: string; reason: string }>();
    const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    /** `reason` is the machine-readable cause (engine code, 'network', 'throttled', ...) exposed as data-reason. */
    const say = (message: string, reason: string) => {
        setToast({ text: message, reason });
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(undefined), 3000);
    };
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    /** One move in flight at a time; the returned view is the new truth, a rejection leaves the table as it was. */
    const play = async (move: MoveRequest) => {
        if (busy) {
            return;
        }
        setBusy(true);
        try {
            show(await api.move(duelId, move));
            setSelectedTarget(undefined);
            setToast(undefined);
            buzz('tap');
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                // Somebody else's move landed first: re-read rather than retry a move made against a stale table.
                await refresh();
            } else if (error instanceof ApiError && error.status === 404) {
                await refresh();
            } else if (error instanceof ApiError && error.status === 0) {
                // The move may or may not have reached the server before the connection dropped; re-read to find out.
                say(t('duel.connectionLost'), 'network');
                await refresh();
            } else {
                buzz('error');
                const hand = tableRef.current?.querySelector('[data-testid="hand"]');
                if (hand) {
                    void animate(hand, 'shake', {});
                }
                if (error instanceof ApiError) {
                    say(
                        reasonMessage(error.reason) ?? describeError(error),
                        error.reason ?? (error.status === 429 ? 'throttled' : 'generic'),
                    );
                } else {
                    say(describeError(error), 'generic');
                }
            }
        } finally {
            setBusy(false);
        }
    };

    const onHandCard = (view: DuelView, card: Card) => {
        const open = undefendedAttacks(view);
        if (role(view) === 'attacker' || open.length === 0) {
            // A defender with nothing to beat is out of turn; the engine says so, which beats silently ignoring the tap.
            void play({ type: 'ATTACK', card });
            return;
        }
        const target =
            selectedTarget ??
            (open.length === 1
                ? open[0]
                : (() => {
                      const candidates = targetsFor(view, card);
                      return candidates.length === 1 ? candidates[0] : undefined;
                  })());
        if (!target) {
            say(t('duel.pickTarget'), 'pick-target');
            return;
        }
        void play({ type: 'DEFEND', attackCard: target, card });
    };

    const onTableCard = (view: DuelView, attack: Card) => {
        if (role(view) !== 'defender' || !undefendedAttacks(view).some((open) => sameCard(open, attack))) {
            return;
        }
        setSelectedTarget(selectedTarget && sameCard(selectedTarget, attack) ? undefined : attack);
    };

    const exit = () => {
        closeStream.current();
        onExit();
    };

    switch (state.kind) {
        case 'loading':
            return <p class="notice">{t('duel.loading')}</p>;
        case 'gone':
            return (
                <section class="lobby" data-testid="duel-gone">
                    <p class="error" role="alert">
                        {state.message}
                    </p>
                    <button data-testid="back-to-lobby" onClick={exit}>
                        {t('duel.back')}
                    </button>
                </section>
            );
        case 'over':
            return (
                <section
                    class={`result ${state.result.result.toLowerCase()}`}
                    data-testid="result"
                    data-result={state.result.result}
                    ref={(el) => {
                        if (el) {
                            void animate(el, 'deal', {});
                        }
                    }}
                >
                    <h1>{t(`duel.result.${state.result.result}`)}</h1>
                    <p>{explain(state.result, opponentName)}</p>
                    {state.coins !== undefined && (
                        <div
                            class="coin-delta"
                            data-testid="coin-delta"
                            data-delta={state.coins}
                            ref={(el) => {
                                if (el) {
                                    void animate(el, 'deal', {});
                                }
                            }}
                        >
                            <CoinAmount amount={state.coins} signed />
                        </div>
                    )}
                    <button class="primary big" data-testid="back-to-lobby" onClick={exit}>
                        {t('duel.back')}
                    </button>
                </section>
            );
        case 'playing':
            return (
                <div class="duel" ref={tableRef}>
                    <Table
                        view={state.view}
                        you={{ name: t('duel.you'), photoUrl: player.photoUrl }}
                        opponent={{ name: opponentName }}
                        selectedTarget={selectedTarget}
                        busy={busy}
                        swipe={settings.value.swipe}
                        onHandCard={(card) => onHandCard(state.view, card)}
                        onTableCard={(attack) => onTableCard(state.view, attack)}
                        onTake={() => void play({ type: 'TAKE' })}
                        onEndAttack={() => void play({ type: 'END_ATTACK' })}
                        onClockWarning={clockWarning}
                    />
                    {toast && (
                        <p class="toast" role="alert" data-reason={toast.reason}>
                            {toast.text}
                        </p>
                    )}
                </div>
            );
    }
}

/** Sounds and haptics for one table event. Cosmetic by contract: nothing here can produce a move. */
function react(event: TableEvent, haptic: (kind: HapticKind) => void): void {
    switch (event.type) {
        case 'card_played':
            audio.play('slide');
            break;
        case 'card_beaten':
            audio.play('beat');
            if (event.by === 'you') {
                haptic('success');
            }
            break;
        case 'cards_taken':
            audio.play('take');
            if (event.by === 'you') {
                haptic('warning');
            }
            break;
        case 'card_dealt':
            if (event.to === 'you') {
                audio.play('deal');
            }
            break;
        case 'turn_started':
            if (event.yours) {
                audio.play('turn');
            }
            break;
        case 'duel_finished':
            audio.play(event.result === 'LOST' ? 'lose' : 'win');
            haptic(event.result === 'LOST' ? 'error' : 'success');
            break;
        case 'duel_started':
        case 'attack_ended':
            break;
    }
}

/** Animations for one table event, on the elements the new view rendered. */
async function animateEvent(root: HTMLElement, event: TableEvent): Promise<void> {
    const pair = (card: Card) => root.querySelector(`.pair[data-attack="${cardId(card)}"]`);
    switch (event.type) {
        case 'card_played': {
            const el = pair(event.card);
            if (el) {
                await animate(el, 'deal', {});
            }
            break;
        }
        case 'card_beaten': {
            const el = pair(event.attack)?.querySelector('.defence') ?? pair(event.attack);
            if (el) {
                await animate(el, 'beat', {});
            }
            break;
        }
        case 'cards_taken': {
            const felt = root.querySelector('[data-testid="felt"]');
            if (felt && event.by === 'you') {
                await animate(felt, 'shake', {});
            }
            break;
        }
        case 'turn_started': {
            const status = root.querySelector('[role="status"]');
            if (status && event.yours) {
                await animate(status, 'pulse', {});
            }
            break;
        }
        case 'card_dealt': {
            const hand = root.querySelector('[data-testid="hand"]');
            if (hand && event.to === 'you') {
                await animate(hand, 'deal', {});
            }
            break;
        }
        case 'duel_started':
        case 'attack_ended':
        case 'duel_finished':
            break;
    }
}
