import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../api/client';
import type { DuelStreamOptions } from '../api/events';
import type {
    ChallengeView,
    DuelEvent,
    DuelSummary,
    DuelView,
    InviteView,
    MissionView,
    MoveRequest,
    ProgressView,
} from '../api/types';
import { audio } from '../audio';
import { speech } from '../audio/speech';
import type { SignedInPlayer } from '../auth/session';
import type { LayoutDirective } from '../content/layout';
import { equipped } from '../content/loader';
import { PackBubbles, PackRuntime } from '../content/runtime';
import { type Card, cardId, sameCard } from '../game/cards';
import { contentEvents, type Result, resultOf, type TableEvent } from '../game/diff';
import { animate, motionEnabled } from '../motion';
import { loadout } from '../state/loadout';
import { settings } from '../state/settings';
import { reasonMessage } from '../game/reasons';
import { role, statusState, targetsFor, undefendedAttacks } from '../game/selectors';
import { t } from '../i18n';
import type { HapticKind, Telegram } from '../telegram/webapp';
import { describeError } from './errors';
import { Result as ResultScreen } from './Result';
import { emoteCode, emoteGlyph, emotePhrase } from './cosmetics';
import type { ClockWarning } from './MoveTimer';
import { ProgressLines } from './profile/ProgressLines';
import { type Participant, Table } from './Table';

export type DuelApi = Pick<ApiClient, 'duel' | 'move' | 'history' | 'activeDuels' | 'emote'> &
    /** The social calls behind the rematch; a client without them simply shows no rematch. */
    Partial<Pick<ApiClient, 'friends' | 'challenge' | 'challenges' | 'acceptInvite'>> &
    /** Progress and missions for the result screen's lines; a client without them shows none. */
    Partial<Pick<ApiClient, 'progress' | 'missions'>>;

/** Progress and missions as read at one moment; the result screen shows the difference between two. */
interface Retention {
    progress: ProgressView;
    missions: MissionView[] | undefined;
}
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
    /** A rematch challenge went out: the shell shows the waiting screen for it. */
    onRematchSent?: ((invite: InviteView, opponentName: string) => void) | undefined;
    /** The opponent's rematch was accepted: the shell moves to that duel. */
    onDuel?: ((duelId: string) => void) | undefined;
}

type State =
    | { kind: 'loading' }
    | { kind: 'playing'; view: DuelView }
    /** `coins` is the caller's signed net for a staked duel, undefined for a friendly one. */
    | {
          kind: 'over';
          result: Result;
          coins: number | undefined;
          stake: number;
          opponentId: string | undefined;
      }
    | { kind: 'gone'; message: string };

/** An emote on screen: who threw it and which one. */
interface EmoteBubble {
    id: number;
    emote: string;
    from: 'you' | 'opponent';
}

/** How long a thrown emote floats over its sender. */
const EMOTE_MS = 2500;

/** Delay before re-trying a re-fetch that failed (429 or no network). */
const RETRY_MS = 1500;
/** How many times the history is read for a finished duel before the duel is declared gone. */
const HISTORY_ATTEMPTS = 4;
const CLOCK_HINT = 'cardwar.hint.clock';

/** One-time hints live in localStorage; a blocked storage just means the hint shows again, never an error. */
function hintShown(key: string): boolean {
    try {
        return localStorage.getItem(key) !== null;
    } catch {
        return false;
    }
}

function markHint(key: string): void {
    try {
        localStorage.setItem(key, '1');
    } catch {
        // Storage blocked: the hint may show once more next time.
    }
}

/** How often a finished screen looks for the opponent's rematch challenge. */
const REMATCH_POLL_MS = 5000;

/** What a finished view moved for the caller: the winner takes the pot (net +stake), a draw refunds both. */
function coinsOf(view: DuelView, result: Result): number | undefined {
    if (!(view.stake > 0)) {
        return undefined;
    }
    return result.result === 'WON' ? view.stake : result.result === 'LOST' ? -view.stake : 0;
}

/** The opponent as a summary or history row names them: display name first, the username from older servers. */
function participantOf(
    row: Pick<DuelSummary, 'opponentUsername' | 'opponentDisplayName' | 'opponentPhotoUrl'>,
): Participant {
    return { name: row.opponentDisplayName ?? row.opponentUsername, photoUrl: row.opponentPhotoUrl };
}

/**
 * One duel, live. The event stream is only a nudge: every event re-fetches the caller's view over REST, and a view
 * older than the one on screen is ignored, so out-of-order answers never move the table backwards.
 *
 * <p>The backend deletes a duel the moment it finishes. Whoever did not make the last move therefore gets a 404 on
 * the re-fetch, and the result comes from their history instead.
 */
export function DuelScreen({
    duelId,
    player,
    api,
    telegram,
    openStream,
    onExit,
    onRematchSent,
    onDuel,
}: Props) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [record, setRecord] = useState<{ won: number; lost: number }>();
    const [incoming, setIncoming] = useState<ChallengeView>();
    const [rematchBusy, setRematchBusy] = useState(false);
    const [retentionBefore, setRetentionBefore] = useState<Retention>();
    const [retentionAfter, setRetentionAfter] = useState<Retention>();

    /** Progress (and missions, when the client has them) right now; undefined on a client without the calls. */
    const readRetention = useCallback(async (): Promise<Retention | undefined> => {
        if (!api.progress) {
            return undefined;
        }
        try {
            const [progress, missions] = await Promise.all([api.progress(), api.missions?.()]);
            return { progress, missions };
        } catch {
            return undefined;
        }
    }, [api]);

    // Read once at the start so the result can say what this duel changed.
    useEffect(() => {
        let live = true;
        void readRetention().then((snapshot) => live && snapshot && setRetentionBefore(snapshot));
        return () => {
            live = false;
        };
    }, [readRetention]);
    const [opponent, setOpponent] = useState<Participant>({ name: t('duel.opponent') });
    const opponentName = opponent.name;
    // The full view's profile is the freshest; a summary or history row only fills in until one arrives.
    const profileFromView = useRef(false);
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
    // Only the pack equipped on this device runs, on events from this player's own view.
    const pack = equipped.value;
    const runtime = useMemo(
        () =>
            pack &&
            new PackRuntime(pack, {
                audio,
                speech,
                haptic: buzz,
                animate: (el, primitive) => animate(el, primitive),
                motionEnabled,
                now: () => performance.now(),
                random: Math.random,
            }),
        [pack, buzz],
    );
    const runtimeRef = useRef(runtime);
    runtimeRef.current = runtime;
    useEffect(() => () => runtime?.dispose(), [runtime]);
    const [layouts, setLayouts] = useState<readonly LayoutDirective[]>([]);
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
                    if (!profileFromView.current) {
                        setOpponent(participantOf(entry));
                    }
                    setState({
                        kind: 'over',
                        result: { result: entry.result, reason: entry.endReason },
                        coins: entry.stake > 0 ? entry.coinDelta : undefined,
                        stake: entry.stake,
                        opponentId: entry.opponentId,
                    });
                    // This player did not make the last move, so no view carried the finish: react to it here.
                    const finished: TableEvent = { type: 'duel_finished', result: entry.result };
                    react(finished, buzz);
                    runtimeRef.current?.handle([finished], { hand: [], phase: 'FINISHED' });
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
            if (view.opponentProfile) {
                profileFromView.current = true;
                const profile = view.opponentProfile;
                setOpponent((current) =>
                    current.name === profile.displayName && current.photoUrl === profile.photoUrl
                        ? current
                        : { name: profile.displayName, photoUrl: profile.photoUrl },
                );
            }
            const events = contentEvents(previousView.current, view);
            previousView.current = view;
            // Sounds and haptics need no element, so they fire here; animations wait for the render (see below).
            for (const event of events) {
                react(event, buzz);
            }
            const packRuntime = runtimeRef.current;
            if (packRuntime) {
                packRuntime.handle(events, view);
                setLayouts(packRuntime.layouts);
            }
            setLastEvents(events);
            if (view.phase === 'FINISHED') {
                closeStream.current();
                const result = resultOf(view);
                setState({
                    kind: 'over',
                    result,
                    coins: coinsOf(view, result),
                    stake: view.stake,
                    opponentId: view.opponent,
                });
            } else {
                setState({ kind: 'playing', view });
            }
        },
        [buzz],
    );

    // A pack equipped (or finished loading) mid-duel lays out the hand already on screen; none means no layout.
    useEffect(() => {
        const view = previousView.current;
        if (runtime && view) {
            runtime.handle([{ type: 'hand_changed', hand: view.hand }], view);
        }
        setLayouts(runtime?.layouts ?? []);
    }, [runtime]);

    // Animate what the last view changed, once its elements exist.
    useEffect(() => {
        const root = tableRef.current;
        runtimeRef.current?.flush(root);
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
                if (mine && !profileFromView.current) {
                    setOpponent(participantOf(mine));
                }
            })
            .catch(() => {});
        closeStream.current = openStream(duelId, {
            // An emote is not part of the duel state: show it from the event, no re-read needed.
            onNudge: (event) => (event?.type === 'EMOTE' ? showEmote.current(event) : void refresh()),
            onClosed: () => void refresh(),
        });
        return () => closeStream.current();
    }, [api, duelId, openStream, refresh]);

    const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
    const nextEmote = useRef(1);
    const emoteTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
    useEffect(() => {
        const timers = emoteTimers.current;
        return () => timers.forEach((timer) => clearTimeout(timer));
    }, []);
    /** Read through a ref so the stream, opened once, always reaches the current view and pack. */
    const showEmote = useRef<(event: DuelEvent) => void>(() => {});
    showEmote.current = (event: DuelEvent) => {
        if (!event.emote) {
            return;
        }
        const you = previousView.current?.you ?? player.playerId;
        const bubble: EmoteBubble = {
            id: nextEmote.current++,
            emote: event.emote,
            from: event.player === you ? 'you' : 'opponent',
        };
        setEmotes((current) => [...current, bubble].slice(-4));
        const timer = setTimeout(() => {
            emoteTimers.current.delete(timer);
            setEmotes((current) => current.filter((other) => other.id !== bubble.id));
        }, EMOTE_MS);
        emoteTimers.current.add(timer);
        const packRuntime = runtimeRef.current;
        if (packRuntime) {
            const view = previousView.current;
            packRuntime.handle([{ type: 'emote_received', emote: bubble.emote, by: bubble.from }], {
                hand: view?.hand ?? [],
                phase: view?.phase,
            });
            packRuntime.flush(tableRef.current);
        }
    };

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

    // The clock is invisible until it runs low, so the first own turn ever gets one sentence about it.
    const playingState = state.kind === 'playing' ? statusState(state.view) : undefined;
    const ownTurn =
        playingState === 'your-attack' || playingState === 'throw-in' || playingState === 'defend';
    useEffect(() => {
        if (!ownTurn || hintShown(CLOCK_HINT)) {
            return;
        }
        markHint(CLOCK_HINT);
        say(t('duel.hint.clock'), 'hint');
    }, [ownTurn]);

    /** Both players see it through the stream, the thrower included, so nothing is shown from here. */
    const throwEmote = async (emote: string) => {
        try {
            await api.emote(duelId, emoteCode(emote));
        } catch (error) {
            const reason = error instanceof ApiError ? error.reason : undefined;
            if (reason === 'EMOTE_TOO_FAST') {
                say(t('duel.emoteTooFast'), reason);
            } else {
                say(describeError(error), reason ?? 'generic');
            }
        }
    };

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

    // Once over: the running score with this opponent, and a watch for their rematch while the screen is open.
    const over = state.kind === 'over' ? state : undefined;
    const overOpponentId = over?.opponentId;
    useEffect(() => {
        if (!over || !overOpponentId) {
            return;
        }
        let live = true;
        void readRetention().then((snapshot) => live && snapshot && setRetentionAfter(snapshot));
        if (api.friends) {
            api.friends()
                .then((friends) => {
                    const friend = friends.find((row) => row.playerId === overOpponentId);
                    if (live && friend) {
                        setRecord({ won: friend.won, lost: friend.lost });
                    }
                })
                .catch(() => {});
        }
        const poll = api.challenges?.bind(api);
        if (!poll || !api.acceptInvite || !onDuel) {
            return () => {
                live = false;
            };
        }
        const check = () =>
            poll()
                .then((rows) => {
                    if (live) {
                        setIncoming(rows.find((row) => row.from.playerId === overOpponentId));
                    }
                })
                .catch(() => {});
        void check();
        const timer = setInterval(() => void check(), REMATCH_POLL_MS);
        return () => {
            live = false;
            clearInterval(timer);
        };
    }, [over !== undefined, overOpponentId, api, onDuel, readRetention]);

    const sendRematch = async () => {
        if (!over || !overOpponentId || !api.challenge || !onRematchSent) {
            return;
        }
        setRematchBusy(true);
        try {
            const invite = await api.challenge(overOpponentId, over.stake);
            onRematchSent(invite, opponentName);
        } catch (error) {
            say(
                (error instanceof ApiError && reasonMessage(error.reason)) ||
                    t('duel.errors.rematch', { error: describeError(error) }),
                error instanceof ApiError ? (error.reason ?? 'generic') : 'network',
            );
            setRematchBusy(false);
        }
    };

    const acceptRematch = async () => {
        if (!incoming || !api.acceptInvite || !onDuel) {
            return;
        }
        setRematchBusy(true);
        try {
            const view = await api.acceptInvite(incoming.inviteId);
            onDuel(view.duelId);
        } catch (error) {
            say(t('duel.errors.rematch', { error: describeError(error) }), 'generic');
            setIncoming(undefined);
            setRematchBusy(false);
        }
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
                <ResultScreen
                    result={state.result}
                    coins={state.coins}
                    stake={state.stake}
                    opponent={opponent}
                    record={record}
                    progress={
                        retentionAfter && (
                            <ProgressLines
                                before={retentionBefore?.progress}
                                after={retentionAfter.progress}
                                missionsBefore={retentionBefore?.missions}
                                missionsAfter={retentionAfter.missions}
                            />
                        )
                    }
                    rematch={
                        state.opponentId && api.challenge && onRematchSent
                            ? { busy: rematchBusy, onRematch: () => void sendRematch() }
                            : undefined
                    }
                    incoming={
                        incoming
                            ? {
                                  stake: incoming.stake,
                                  busy: rematchBusy,
                                  onAccept: () => void acceptRematch(),
                              }
                            : undefined
                    }
                    onHome={exit}
                />
            );
        case 'playing': {
            const mine = loadout.value;
            return (
                <div class="duel" ref={tableRef}>
                    <Table
                        view={state.view}
                        you={{ name: t('duel.you'), photoUrl: player.photoUrl }}
                        opponent={opponent}
                        selectedTarget={selectedTarget}
                        busy={busy}
                        swipe={settings.value.swipe}
                        onHandCard={(card) => onHandCard(state.view, card)}
                        onTableCard={(attack) => onTableCard(state.view, attack)}
                        onTake={() => void play({ type: 'TAKE' })}
                        onEndAttack={() => void play({ type: 'END_ATTACK' })}
                        onClockWarning={clockWarning}
                        layouts={layouts}
                        cosmetics={{
                            table: mine?.table,
                            back: mine?.cardBack,
                            frame: mine?.frame,
                            opponentBack: state.view.opponentCosmetics?.cardBack,
                            opponentFrame: state.view.opponentCosmetics?.frame,
                        }}
                    />
                    {runtime && <PackBubbles runtime={runtime} />}
                    {mine && mine.emotes.length > 0 && (
                        <EmoteTray emotes={mine.emotes} onThrow={(emote) => void throwEmote(emote)} />
                    )}
                    {emotes.map((bubble) => {
                        // A phrase emote floats its words along with the glyph; a plain one is just the glyph.
                        const phrase = emotePhrase(bubble.emote);
                        return (
                            <div
                                key={bubble.id}
                                class={`emote-bubble from-${bubble.from}${phrase ? ' phrase' : ''}`}
                                data-testid="emote-bubble"
                                data-emote={bubble.emote}
                                data-emote-text={phrase}
                                data-from={bubble.from}
                                aria-hidden="true"
                            >
                                {emoteGlyph(bubble.emote)}
                                {phrase && <span class="emote-text">{phrase}</span>}
                            </div>
                        );
                    })}
                    {toast && (
                        <p class="toast" role="alert" data-reason={toast.reason}>
                            {toast.text}
                        </p>
                    )}
                </div>
            );
        }
    }
}

/** A button by the table that opens the owned emotes; picking one throws it and closes the tray. */
function EmoteTray({ emotes, onThrow }: { emotes: readonly string[]; onThrow: (emote: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div class="emote-tray">
            {open && (
                <div class="emote-options" role="menu">
                    {emotes.map((emote) => (
                        <button
                            key={emote}
                            type="button"
                            role="menuitem"
                            data-testid={`emote-${emote}`}
                            class={emotePhrase(emote) ? 'phrase' : undefined}
                            title={emotePhrase(emote)}
                            onClick={() => {
                                setOpen(false);
                                onThrow(emote);
                            }}
                        >
                            {emoteGlyph(emote)}
                            {emotePhrase(emote) && <span class="emote-text">{emotePhrase(emote)}</span>}
                        </button>
                    ))}
                </div>
            )}
            <button
                type="button"
                class="emote-toggle"
                aria-expanded={open}
                aria-label={t('duel.emotes')}
                data-testid="emote-tray"
                onClick={() => setOpen(!open)}
            >
                🙂
            </button>
        </div>
    );
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
        case 'hand_changed':
        case 'emote_received':
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
        case 'hand_changed':
        case 'emote_received':
            break;
    }
}
