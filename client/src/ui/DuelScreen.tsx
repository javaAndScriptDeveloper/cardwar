import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { DuelStreamOptions } from '../api/events';
import type { DuelResult, DuelView, MoveRequest } from '../api/types';
import { type Card, sameCard } from '../game/cards';
import { reasonMessage } from '../game/reasons';
import { role, targetsFor, undefendedAttacks } from '../game/selectors';
import type { Telegram } from '../telegram/webapp';
import { describeError } from './errors';
import { Table } from './Table';

export type DuelApi = Pick<ApiClient, 'duel' | 'move' | 'history' | 'activeDuels'>;
export type StreamOpener = (
    duelId: string,
    options: Omit<DuelStreamOptions, 'fetchImpl' | 'headers'>,
) => () => void;

interface Props {
    duelId: string;
    api: DuelApi;
    telegram: Telegram;
    openStream: StreamOpener;
    onExit: () => void;
}

interface Result {
    result: DuelResult;
    reason: string | undefined;
}

type State =
    | { kind: 'loading' }
    | { kind: 'playing'; view: DuelView }
    | { kind: 'over'; result: Result }
    | { kind: 'gone'; message: string };

function resultOf(view: DuelView): Result {
    const outcome = view.outcome;
    if (!outcome || outcome.draw) {
        return { result: 'DRAW', reason: outcome?.reason };
    }
    return { result: outcome.winner === view.you ? 'WON' : 'LOST', reason: outcome.reason };
}

/** Delay before re-trying a re-fetch that failed (429 or no network). */
const RETRY_MS = 1500;

const HEADINGS: Record<DuelResult, string> = { WON: 'You won', LOST: 'You lost', DRAW: 'Draw' };

function explain(result: Result, opponentName: string): string {
    if (result.result === 'DRAW') {
        return 'You both got rid of your cards in the same round.';
    }
    return result.result === 'WON'
        ? 'You got rid of all your cards first.'
        : `${opponentName} got rid of all their cards first. You are the durak this time.`;
}

/**
 * One duel, live. The event stream is only a nudge: every event re-fetches the caller's view over REST, and a view
 * older than the one on screen is ignored, so out-of-order answers never move the table backwards.
 *
 * <p>The backend deletes a duel the moment it finishes. Whoever did not make the last move therefore gets a 404 on
 * the re-fetch, and the result comes from their history instead.
 */
export function DuelScreen({ duelId, api, telegram, openStream, onExit }: Props) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [opponentName, setOpponentName] = useState('Opponent');
    const version = useRef(-1);
    const closeStream = useRef<() => void>(() => {});

    const finishFromHistory = useCallback(async () => {
        try {
            const entry = (await api.history()).find((row) => row.duelId === duelId);
            if (entry) {
                setOpponentName(entry.opponentUsername);
                setState({ kind: 'over', result: { result: entry.result, reason: entry.endReason } });
            } else {
                setState({ kind: 'gone', message: 'This duel is no longer available. It may have expired.' });
            }
        } catch (error) {
            setState({ kind: 'gone', message: `Could not load the result: ${describeError(error)}.` });
        }
    }, [api, duelId]);

    const show = useCallback((view: DuelView) => {
        if (view.version < version.current) {
            return;
        }
        version.current = view.version;
        if (view.phase === 'FINISHED') {
            closeStream.current();
            setState({ kind: 'over', result: resultOf(view) });
        } else {
            setState({ kind: 'playing', view });
        }
    }, []);

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
            telegram.haptic('tap');
        } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
                // Somebody else's move landed first: re-read rather than retry a move made against a stale table.
                await refresh();
            } else if (error instanceof ApiError && error.status === 404) {
                await refresh();
            } else if (error instanceof ApiError && error.status === 0) {
                // The move may or may not have reached the server before the connection dropped; re-read to find out.
                say('Connection lost. Check the table and try again.', 'network');
                await refresh();
            } else {
                telegram.haptic('error');
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
            say('Tap the card you want to beat first.', 'pick-target');
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
            return <p class="notice">Loading the duel…</p>;
        case 'gone':
            return (
                <section class="lobby">
                    <p class="error" role="alert">
                        {state.message}
                    </p>
                    <button data-testid="back-to-lobby" onClick={exit}>
                        Back to start
                    </button>
                </section>
            );
        case 'over':
            return (
                <section
                    class={`result ${state.result.result.toLowerCase()}`}
                    data-testid="result"
                    data-result={state.result.result}
                >
                    <h1>{HEADINGS[state.result.result]}</h1>
                    <p>{explain(state.result, opponentName)}</p>
                    <button class="primary big" data-testid="back-to-lobby" onClick={exit}>
                        Back to start
                    </button>
                </section>
            );
        case 'playing':
            return (
                <>
                    <Table
                        view={state.view}
                        opponentName={opponentName}
                        selectedTarget={selectedTarget}
                        busy={busy}
                        onHandCard={(card) => onHandCard(state.view, card)}
                        onTableCard={(attack) => onTableCard(state.view, attack)}
                        onTake={() => void play({ type: 'TAKE' })}
                        onEndAttack={() => void play({ type: 'END_ATTACK' })}
                    />
                    {toast && (
                        <p class="toast" role="alert" data-reason={toast.reason}>
                            {toast.text}
                        </p>
                    )}
                </>
            );
    }
}
