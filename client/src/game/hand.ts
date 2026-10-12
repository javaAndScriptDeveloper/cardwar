import { type Card, rankValue, type Suit } from './cards';

const RED: readonly Suit[] = ['DIAMONDS', 'HEARTS'];
const BLACK: readonly Suit[] = ['CLUBS', 'SPADES'];

/**
 * The order popular Durak apps draw a hand in: suits grouped, ranks ascending, trumps last. The other three suits
 * go other colour, same colour, other colour, so with the trumps after them no two neighbouring groups share a
 * colour. Cosmetic only: the server's hand order means nothing, and a pack's layout rules still apply on top.
 */
export function sortHand(hand: readonly Card[], trump: Suit): Card[] {
    const same = RED.includes(trump) ? RED : BLACK;
    const other = RED.includes(trump) ? BLACK : RED;
    const order: Suit[] = [
        other[0] as Suit,
        same.find((suit) => suit !== trump) as Suit,
        other[1] as Suit,
        trump,
    ];
    return [...hand].sort(
        (a, b) => order.indexOf(a.suit) - order.indexOf(b.suit) || rankValue(a.rank) - rankValue(b.rank),
    );
}
