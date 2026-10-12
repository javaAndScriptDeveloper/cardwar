/** Mirrors the backend's engine enums; declaration order is the rank order the rules use. */
export const RANKS = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'] as const;
export const SUITS = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export interface Card {
    rank: Rank;
    suit: Suit;
}

export const FULL_DECK: readonly Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));

export function sameCard(a: Card, b: Card): boolean {
    return a.rank === b.rank && a.suit === b.suit;
}

export function rankValue(rank: Rank): number {
    return RANKS.indexOf(rank);
}

/** Stable machine id ("SEVEN_OF_SPADES"), used in data-* attributes so tests never depend on display names. */
export function cardId(card: Card): string {
    return `${card.rank}_OF_${card.suit}`;
}
