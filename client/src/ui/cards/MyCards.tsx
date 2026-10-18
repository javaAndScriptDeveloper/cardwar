import { equipped } from '../../content/loader';
import { type Card, cardId } from '../../game/cards';
import { cardLabel, t } from '../../i18n';
import { CardImage } from '../CardImage';

const SUITS: readonly Card['suit'][] = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
const RANKS_DESC: readonly Card['rank'][] = [
    'ACE',
    'KING',
    'QUEEN',
    'JACK',
    'TEN',
    'NINE',
    'EIGHT',
    'SEVEN',
    'SIX',
];

/**
 * Every face of the equipped deck, aces first, so the player can look at the whole pack outside a duel. Titles come
 * from the pack (a satire deck names its personas); the classic deck has none, so the card label stands in.
 */
export function MyCards() {
    const pack = equipped.value;
    return (
        <section class="screen cards-screen" data-testid="cards-screen">
            <h1>{t('cards.title')}</h1>
            <p class="notice">
                <span data-testid="deck-name">{pack?.name.uk ?? t('cards.classic')}</span>
                {' · '}
                {t('cards.hint')}
            </p>
            <div class="gallery">
                {RANKS_DESC.flatMap((rank) =>
                    SUITS.map((suit) => {
                        const card = { rank, suit };
                        const id = cardId(card);
                        return (
                            <figure class="gallery-card" data-testid="gallery-card" data-card={id} key={id}>
                                <CardImage card={card} class="gallery-face" />
                                <figcaption>{pack?.cards[id]?.title?.uk ?? cardLabel(card)}</figcaption>
                            </figure>
                        );
                    }),
                )}
            </div>
        </section>
    );
}
