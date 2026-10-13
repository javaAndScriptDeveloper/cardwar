import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import type { DuelView } from '../api/types';
import { arrange, type LayoutDirective } from '../content/layout';
import { type Card, cardId, sameCard, type Suit } from '../game/cards';
import { sortHand } from '../game/hand';
import { canEndAttack, canTake, playable, status, statusState } from '../game/selectors';
import { cardLabel, suitLabel, t } from '../i18n';
import { CardBack, CardImage } from './CardImage';
import { styleRef } from './cosmetics';
import { Avatar, CoinAmount } from './kit';
import { type ClockWarning, MoveTimer } from './MoveTimer';

export interface Participant {
    name: string;
    photoUrl?: string | undefined;
}

/** Content refs of the cosmetics at the table: yours from the loadout, the opponent's from their view. */
export interface TableCosmetics {
    table?: string | undefined;
    back?: string | undefined;
    frame?: string | undefined;
    opponentBack?: string | undefined;
    opponentFrame?: string | undefined;
}

export interface TableProps {
    view: DuelView;
    you: Participant;
    opponent: Participant;
    /** The undefended attack the defender picked before choosing a card to beat it with. */
    selectedTarget?: Card | undefined;
    busy?: boolean;
    /** Swipe a hand card up to play it (a setting); a tap always works. */
    swipe?: boolean;
    onHandCard: (card: Card) => void;
    onTableCard: (attack: Card) => void;
    onTake: () => void;
    onEndAttack: () => void;
    /** Your own move clock reached ten or five seconds (sound and haptics live in the duel screen). */
    onClockWarning?: ((warning: ClockWarning) => void) | undefined;
    /** The equipped pack's hand layouts; they only change the order cards are drawn in. */
    layouts?: readonly LayoutDirective[] | undefined;
    cosmetics?: TableCosmetics | undefined;
}

const SUIT_SYMBOL: Record<Suit, string> = { CLUBS: '♣', DIAMONDS: '♦', HEARTS: '♥', SPADES: '♠' };

/** How many backs the discard pile shows at most; the count badge carries the rest. */
const DISCARD_STACK = 4;

/** One chip per order of magnitude of the pot, up to four: 200 → 2, 2000 → 3, 10 000 → 4. */
function chipsFor(pot: number): number {
    return Math.min(4, Math.max(1, Math.floor(Math.log10(Math.max(pot, 1)))));
}

/** Whose clock runs: the server says when it has one; without it, the turn state decides. */
function sideToMove(view: DuelView): 'you' | 'opponent' | undefined {
    if (view.phase === 'FINISHED') {
        return undefined;
    }
    if (view.toMove) {
        return view.toMove === view.you ? 'you' : 'opponent';
    }
    const state = statusState(view);
    return state === 'your-attack' || state === 'throw-in' || state === 'defend' ? 'you' : 'opponent';
}

/** Strikes that forfeit the duel; one dot each. */
const STRIKES_TO_FORFEIT = 3;

/** How far up a card must travel to count as a swipe, and how much sideways drift is still "up". */
const SWIPE_UP_PX = 56;
const SWIPE_DRIFT_PX = 40;
const TAP_SLOP_PX = 8;

/**
 * Pure rendering of one redacted view. No game logic lives here: selectors decide what is enabled, the server
 * decides what is legal. Hand cards stay tappable even when the selectors see no use for them, so a mistaken tap
 * reaches the server and comes back with the engine's own explanation.
 */
export function Table({
    view,
    you,
    opponent,
    selectedTarget,
    busy = false,
    swipe = false,
    onHandCard,
    onTableCard,
    onTake,
    onEndAttack,
    onClockWarning,
    layouts = [],
    cosmetics = {},
}: TableProps) {
    const tableStyle = styleRef(cosmetics.table, 'green');
    const opponentBack = styleRef(cosmetics.opponentBack, 'classic');
    const yourBack = styleRef(cosmetics.back, 'classic');
    const usable = playable(view);
    const isUsable = (card: Card) => usable.some((candidate) => sameCard(candidate, card));
    const toMove = sideToMove(view);

    return (
        <section class="table">
            <header class="opponent" data-testid="opponent-side" data-to-move={String(toMove === 'opponent')}>
                <Framed frame={cosmetics.opponentFrame} data-testid="opponent-frame">
                    <Avatar
                        name={opponent.name}
                        photoUrl={opponent.photoUrl}
                        size={36}
                        data-testid="opponent-avatar"
                    />
                </Framed>
                <span class="name">{opponent.name}</span>
                <Strikes side="opponent" count={view.strikes?.opponent} />
                <span class="count" data-testid="opponent-count">
                    {view.opponentHandCount}
                </span>
                <div class="fan" data-testid="opponent-fan" data-back={opponentBack}>
                    {Array.from({ length: view.opponentHandCount }, (_, index) => (
                        <CardBack key={index} class="card small" back={opponentBack} />
                    ))}
                </div>
            </header>

            <div class={`felt table-${tableStyle}`} data-testid="felt" data-table={tableStyle}>
                <div class="deck" data-testid="talon" data-back={yourBack}>
                    {view.talonCount > 0 ? (
                        <CardBack class="card small" back={yourBack} />
                    ) : (
                        <div class="card small empty" />
                    )}
                    <span class="count" data-testid="talon-count">
                        {view.talonCount}
                    </span>
                    {view.talonCount > 0 ? (
                        <CardImage
                            card={view.trumpCard}
                            class="card small trump"
                            data-testid="trump"
                            data-card={cardId(view.trumpCard)}
                            data-suit={view.trumpSuit}
                        />
                    ) : (
                        // The trump card was the last one drawn; only its suit is still in play.
                        <span
                            class={`trump-suit suit-${view.trumpSuit.toLowerCase()}`}
                            data-testid="trump"
                            data-suit={view.trumpSuit}
                            role="img"
                            aria-label={`${t('duel.trump')}: ${suitLabel(view.trumpSuit)}`}
                        >
                            {SUIT_SYMBOL[view.trumpSuit]}
                        </span>
                    )}
                    <span class="hint">{t('duel.trump')}</span>
                    {view.stake > 0 && (
                        <span class="pot" data-testid="pot" data-pot={2 * view.stake} title={t('duel.pot')}>
                            <span class="chips" aria-hidden="true">
                                {Array.from({ length: chipsFor(2 * view.stake) }, (_, index) => (
                                    <i key={index} class="chip" />
                                ))}
                            </span>
                            <CoinAmount amount={2 * view.stake} />
                        </span>
                    )}
                </div>
                <div class="pairs" data-testid="pairs">
                    {view.table.map((pair) => {
                        const label = pair.defence
                            ? t('duel.beatenBy', {
                                  attack: cardLabel(pair.attack),
                                  defence: cardLabel(pair.defence),
                              })
                            : cardLabel(pair.attack);
                        const selected =
                            selectedTarget !== undefined && sameCard(selectedTarget, pair.attack);
                        return (
                            <button
                                key={cardId(pair.attack)}
                                class={`pair${selected ? ' selected' : ''}`}
                                aria-label={label}
                                aria-pressed={selected}
                                data-attack={cardId(pair.attack)}
                                data-defence={pair.defence ? cardId(pair.defence) : undefined}
                                disabled={busy}
                                onClick={() => onTableCard(pair.attack)}
                            >
                                <CardImage card={pair.attack} />
                                {pair.defence && <CardImage card={pair.defence} class="card defence" />}
                            </button>
                        );
                    })}
                </div>
                {view.discardCount > 0 && (
                    <div
                        class="discard-pile"
                        data-testid="discard-pile"
                        data-count={view.discardCount}
                        title={t('duel.discarded', { n: view.discardCount })}
                    >
                        {Array.from({ length: Math.min(view.discardCount, DISCARD_STACK) }, (_, index) => (
                            <CardBack key={index} class="card small" back={yourBack} />
                        ))}
                        <span class="count">{view.discardCount}</span>
                    </div>
                )}
            </div>

            {view.deadline && view.toMove && view.phase !== 'FINISHED' && (
                <MoveTimer
                    deadline={view.deadline}
                    side={view.toMove === view.you ? 'you' : 'opponent'}
                    onWarning={onClockWarning}
                />
            )}
            <p class="status" role="status" data-state={statusState(view)}>
                {status(view, opponent.name)}
            </p>

            <div class="actions">
                <button
                    data-testid="take"
                    data-idle={canTake(view) ? undefined : ''}
                    disabled={busy || !canTake(view)}
                    onClick={onTake}
                >
                    {t('duel.take')}
                </button>
                <button
                    class="primary"
                    data-testid="end-attack"
                    data-idle={canEndAttack(view) ? undefined : ''}
                    disabled={busy || !canEndAttack(view)}
                    onClick={onEndAttack}
                >
                    {t('duel.endAttack')}
                </button>
            </div>

            <footer class="you" data-testid="you-side" data-to-move={String(toMove === 'you')}>
                <Framed frame={cosmetics.frame} data-testid="you-frame">
                    <Avatar name={you.name} photoUrl={you.photoUrl} size={28} data-testid="you-avatar" />
                </Framed>
                <span class="name">{you.name}</span>
                <Strikes side="you" count={view.strikes?.you} />
                <span class="count">{view.hand.length}</span>
            </footer>
            <div class="hand" data-testid="hand" style={{ '--cards': view.hand.length }}>
                {arrange(sortHand(view.hand, view.trumpSuit), layouts).map((card, index) => (
                    <HandCard
                        key={cardId(card)}
                        card={card}
                        index={index}
                        usable={isUsable(card)}
                        busy={busy}
                        swipe={swipe}
                        onPlay={onHandCard}
                    />
                ))}
            </div>
        </section>
    );
}

/** An avatar in its shop frame; without a frame the avatar stands alone. */
function Framed({
    frame,
    'data-testid': testId,
    children,
}: {
    frame: string | undefined;
    'data-testid': string;
    children: ComponentChildren;
}) {
    if (frame === undefined) {
        return <>{children}</>;
    }
    const ref = styleRef(frame, 'none');
    return (
        <span class={`avatar-frame frame-${ref}`} data-frame={ref} data-testid={testId}>
            {children}
        </span>
    );
}

/** Missed moves as dots; nothing at all from a server that has no clock. */
function Strikes({ side, count }: { side: 'you' | 'opponent'; count: number | undefined }) {
    if (count === undefined) {
        return null;
    }
    return (
        <span
            class="strikes"
            data-testid={`strikes-${side}`}
            data-strikes={count}
            title={t('duel.strikes', { n: count, max: STRIKES_TO_FORFEIT })}
        >
            {Array.from({ length: STRIKES_TO_FORFEIT }, (_, index) => (
                <span key={index} class={`strike${index < count ? ' on' : ''}`} />
            ))}
        </span>
    );
}

interface HandCardProps {
    card: Card;
    /** Position in the hand, so the stylesheet can fan the cards (--i against the hand's --cards). */
    index: number;
    usable: boolean;
    busy: boolean;
    swipe: boolean;
    onPlay: (card: Card) => void;
}

/**
 * One card in the hand. A tap is a plain click (so keyboards and assistive tech work); with swipe on, dragging it
 * upward past the threshold plays it from pointer-up and the click the browser sends afterwards is swallowed.
 */
function HandCard({ card, index, usable, busy, swipe, onPlay }: HandCardProps) {
    const el = useRef<HTMLButtonElement>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const moved = useRef(false);
    const swallowClick = useRef(false);

    const reset = () => {
        start.current = null;
        if (el.current) {
            el.current.style.transform = '';
        }
    };
    const onDown = (event: PointerEvent) => {
        if (!event.isPrimary) {
            return;
        }
        start.current = { x: event.clientX, y: event.clientY };
        moved.current = false;
        swallowClick.current = false;
        el.current?.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
        if (!start.current || !el.current) {
            return;
        }
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) {
            moved.current = true;
        }
        if (swipe && !busy && dy < 0 && Math.abs(dx) < SWIPE_DRIFT_PX) {
            el.current.style.transform = `translateY(${dy}px)`;
        }
    };
    const onUp = (event: PointerEvent) => {
        if (!start.current) {
            return;
        }
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        reset();
        // A drag of any kind is not a tap: the click that follows must not play the card a second time.
        swallowClick.current = moved.current;
        if (swipe && !busy && dy <= -SWIPE_UP_PX && Math.abs(dx) < SWIPE_DRIFT_PX) {
            onPlay(card);
        }
    };
    const onClick = () => {
        if (swallowClick.current) {
            swallowClick.current = false;
            return;
        }
        if (!busy) {
            onPlay(card);
        }
    };

    return (
        <button
            ref={el}
            class={`hand-card${usable ? ' usable' : ''}`}
            style={{ '--i': index }}
            aria-label={cardLabel(card)}
            data-card={cardId(card)}
            data-playable={String(usable)}
            disabled={busy}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={reset}
            onClick={onClick}
        >
            <CardImage card={card} />
        </button>
    );
}
