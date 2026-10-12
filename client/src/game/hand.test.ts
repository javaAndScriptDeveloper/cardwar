import { describe, expect, it } from 'vitest';
import { type Card, cardId } from './cards';
import { sortHand } from './hand';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('sortHand', () => {
    it('groups by suit with ascending ranks and puts the trumps last, as popular Durak apps do', () => {
        const dealt = [
            c('ACE', 'HEARTS'),
            c('SIX', 'SPADES'),
            c('TEN', 'CLUBS'),
            c('SEVEN', 'HEARTS'),
            c('KING', 'SPADES'),
            c('SIX', 'CLUBS'),
        ];

        expect(sortHand(dealt, 'SPADES').map(cardId)).toEqual([
            'SIX_OF_CLUBS',
            'TEN_OF_CLUBS',
            'SEVEN_OF_HEARTS',
            'ACE_OF_HEARTS',
            'SIX_OF_SPADES',
            'KING_OF_SPADES',
        ]);
    });

    it('alternates colours between neighbouring suits so groups stay easy to tell apart', () => {
        const oneEach = [c('SIX', 'CLUBS'), c('SIX', 'DIAMONDS'), c('SIX', 'HEARTS'), c('SIX', 'SPADES')];

        expect(sortHand(oneEach, 'HEARTS').map((card) => card.suit)).toEqual([
            'CLUBS',
            'DIAMONDS',
            'SPADES',
            'HEARTS',
        ]);
    });

    it('never adds, drops or changes a card', () => {
        const dealt = [c('NINE', 'DIAMONDS'), c('SIX', 'DIAMONDS')];
        const sorted = sortHand(dealt, 'CLUBS');

        expect(sorted).toHaveLength(2);
        expect(sorted.map(cardId).sort()).toEqual(dealt.map(cardId).sort());
        expect(dealt.map(cardId)).toEqual(['NINE_OF_DIAMONDS', 'SIX_OF_DIAMONDS']);
    });
});
