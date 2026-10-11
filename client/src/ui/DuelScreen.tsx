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

    const refresh = useCallback(async () => {
        try {
            show(await api.duel(duelId));
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                closeStream.current();
                await finishFromHistory();
            }
            // Anything else is transient: the next nudge or reconnect fetches again.
        }
    }, [api, duelId, show, finishFromHistory]);

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
    const [toast, setToast] = useState<string>();
    const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const say = (message: string) => {
        setToast(message);
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
            } else {
                telegram.haptic('error');
                say(
                    error instanceof ApiError
                        ? (reasonMessage(error.reason) ?? describeError(error))
                        : describeError(error),
                );
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
            say('Tap the card you want to beat first.');
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
                    <button onClick={exit}>Back to start</button>
                </section>
            );
        case 'over':
            return (
                <section class={`result ${state.result.result.toLowerCase()}`}>
                    <h1>{HEADINGS[state.result.result]}</h1>
                    <p>{explain(state.result, opponentName)}</p>
                    <button class="primary big" onClick={exit}>
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
                        <p class="toast" role="alert">
                            {toast}
                        </p>
                    )}
                </>
            );
    }
}
