import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { DuelStreamOptions } from '../api/events';
import type { DuelResult, DuelView } from '../api/types';
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
export function DuelScreen({ duelId, api, openStream, onExit }: Props) {
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
                <Table
                    view={state.view}
                    opponentName={opponentName}
                    onHandCard={() => {}}
                    onTableCard={() => {}}
                    onTake={() => {}}
                    onEndAttack={() => {}}
                />
            );
    }
}
