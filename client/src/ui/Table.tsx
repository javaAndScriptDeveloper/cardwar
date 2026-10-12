import type { DuelView } from '../api/types';
import { type Card, cardId, sameCard } from '../game/cards';
import { cardLabel, t } from '../i18n';
import { canEndAttack, canTake, playable, status, statusState } from '../game/selectors';
import { CardBack, CardImage } from './CardImage';

export interface TableProps {
    view: DuelView;
    opponentName: string;
    /** The undefended attack the defender picked before choosing a card to beat it with. */
    selectedTarget?: Card | undefined;
    busy?: boolean;
    onHandCard: (card: Card) => void;
    onTableCard: (attack: Card) => void;
    onTake: () => void;
    onEndAttack: () => void;
}

/**
 * Pure rendering of one redacted view. No game logic lives here: selectors decide what is enabled, the server
 * decides what is legal. Hand cards stay tappable even when the selectors see no use for them, so a mistaken tap
 * reaches the server and comes back with the engine's own explanation.
 */
export function Table({
    view,
    opponentName,
    selectedTarget,
    busy,
    onHandCard,
    onTableCard,
    onTake,
    onEndAttack,
}: TableProps) {
    const usable = playable(view);
    const isUsable = (card: Card) => usable.some((candidate) => sameCard(candidate, card));

    return (
        <section class="table">
            <header class="opponent">
                <span class="name">{opponentName}</span>
                <span class="count" data-testid="opponent-count">
                    {view.opponentHandCount}
                </span>
                <div class="fan">
                    {Array.from({ length: view.opponentHandCount }, (_, index) => (
                        <CardBack key={index} class="card small" />
                    ))}
                </div>
            </header>

            <div class="felt">
                <div class="deck">
                    {view.talonCount > 0 ? <CardBack class="card small" /> : <div class="card small empty" />}
                    <span class="count" data-testid="talon-count">
                        {view.talonCount}
                    </span>
                    <CardImage
                        card={view.trumpCard}
                        class="card small trump"
                        data-testid="trump"
                        data-card={cardId(view.trumpCard)}
                    />
                    <span class="hint">{t('duel.trump')}</span>
                </div>
                <div class="pairs">
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
                    <span class="hint discard">{t('duel.discarded', { n: view.discardCount })}</span>
                )}
            </div>

            <p class="status" role="status" data-state={statusState(view)}>
                {status(view, opponentName)}
            </p>

            <div class="actions">
                <button data-testid="take" disabled={busy || !canTake(view)} onClick={onTake}>
                    {t('duel.take')}
                </button>
                <button
                    class="primary"
                    data-testid="end-attack"
                    disabled={busy || !canEndAttack(view)}
                    onClick={onEndAttack}
                >
                    {t('duel.endAttack')}
                </button>
            </div>

            <div class="hand">
                {view.hand.map((card) => (
                    <button
                        key={cardId(card)}
                        class={`hand-card${isUsable(card) ? ' usable' : ''}`}
                        aria-label={cardLabel(card)}
                        data-card={cardId(card)}
                        data-playable={String(isUsable(card))}
                        disabled={busy}
                        onClick={() => onHandCard(card)}
                    >
                        <CardImage card={card} />
                    </button>
                ))}
            </div>
        </section>
    );
}
