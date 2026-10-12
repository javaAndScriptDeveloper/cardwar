import { describe, expect, it } from 'vitest';
import { type Card, cardId, FULL_DECK } from '../game/cards';
import { c } from '../game/fixtures/views';
import { arrange, type LayoutDirective } from './layout';

const ids = (cards: readonly Card[]) => cards.map(cardId);
const KS = 'KING_OF_SPADES';
const JS = 'JACK_OF_SPADES';
const hand = [
    c('SIX', 'CLUBS'),
    c('KING', 'SPADES'),
    c('NINE', 'HEARTS'),
    c('ACE', 'DIAMONDS'),
    c('JACK', 'SPADES'),
];

describe('arrange', () => {
    it('leaves the hand alone without directives', () => {
        expect(ids(arrange(hand, []))).toEqual(ids(hand));
    });

    it('does not mutate its input', () => {
        const copy = [...hand];
        arrange(hand, [{ layout: 'pin_left', cards: [JS] }]);
        expect(copy).toEqual(hand);
    });

    it.each<[string, LayoutDirective[], string[]]>([
        [
            'stick_together gathers at the first one held, in listed order',
            [{ layout: 'stick_together', cards: [KS, JS] }],
            ['SIX_OF_CLUBS', KS, JS, 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS'],
        ],
        [
            'stick_together keeps the listed order even when the second comes first in hand',
            [{ layout: 'stick_together', cards: [JS, KS] }],
            ['SIX_OF_CLUBS', JS, KS, 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS'],
        ],
        [
            'stick_together of three, one missing, sticks the two held',
            [{ layout: 'stick_together', cards: ['ACE_OF_DIAMONDS', 'QUEEN_OF_HEARTS', 'SIX_OF_CLUBS'] }],
            ['ACE_OF_DIAMONDS', 'SIX_OF_CLUBS', KS, 'NINE_OF_HEARTS', JS],
        ],
        [
            'stick_together with only one held changes nothing',
            [{ layout: 'stick_together', cards: [KS, 'QUEEN_OF_SPADES'] }],
            ['SIX_OF_CLUBS', KS, 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS', JS],
        ],
        [
            'pin_left moves the listed cards to the start in listed order',
            [{ layout: 'pin_left', cards: [JS, 'NINE_OF_HEARTS'] }],
            [JS, 'NINE_OF_HEARTS', 'SIX_OF_CLUBS', KS, 'ACE_OF_DIAMONDS'],
        ],
        [
            'pin_right moves the listed cards to the end in listed order',
            [{ layout: 'pin_right', cards: ['SIX_OF_CLUBS', KS] }],
            ['NINE_OF_HEARTS', 'ACE_OF_DIAMONDS', JS, 'SIX_OF_CLUBS', KS],
        ],
        [
            'pins ignore cards not held',
            [{ layout: 'pin_left', cards: ['QUEEN_OF_HEARTS'] }],
            ['SIX_OF_CLUBS', KS, 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS', JS],
        ],
        [
            'directives apply in order: a pin after a stick moves the pair',
            [
                { layout: 'stick_together', cards: [KS, JS] },
                { layout: 'pin_right', cards: [KS, JS] },
            ],
            ['SIX_OF_CLUBS', 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS', KS, JS],
        ],
        [
            'an unknown layout kind is ignored',
            [{ layout: 'spiral' as LayoutDirective['layout'], cards: [KS] }],
            ['SIX_OF_CLUBS', KS, 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS', JS],
        ],
        [
            'duplicate ids in a directive count once',
            [{ layout: 'pin_left', cards: [JS, JS] }],
            [JS, 'SIX_OF_CLUBS', KS, 'NINE_OF_HEARTS', 'ACE_OF_DIAMONDS'],
        ],
    ])('%s', (_, directives, expected) => {
        expect(ids(arrange(hand, directives))).toEqual(expected);
    });

    it('handles an empty hand', () => {
        expect(arrange([], [{ layout: 'stick_together', cards: [KS, JS] }])).toEqual([]);
    });

    it('only ever reorders: every output is a permutation of the hand', () => {
        // A small deterministic generator, so a failure reproduces.
        let seed = 42;
        const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const kinds: LayoutDirective['layout'][] = ['stick_together', 'pin_left', 'pin_right'];
        for (let round = 0; round < 300; round++) {
            const size = Math.floor(next() * 12);
            const pool = [...FULL_DECK].sort(() => next() - 0.5);
            const cards = pool.slice(0, size);
            const directives = Array.from({ length: Math.floor(next() * 4) }, () => ({
                layout: kinds[Math.floor(next() * 3)] ?? 'pin_left',
                cards: pool
                    .slice(0, 18)
                    .filter(() => next() < 0.2)
                    .map(cardId),
            }));
            const out = arrange(cards, directives);
            expect(ids(out).sort()).toEqual(ids(cards).sort());
            for (const d of directives.filter((d) => d.layout === 'stick_together')) {
                const held = d.cards.filter((id) => ids(cards).includes(id));
                if (held.length >= 2 && d === directives[directives.length - 1]) {
                    const at = ids(out).indexOf(held[0] ?? '');
                    expect(ids(out).slice(at, at + held.length)).toEqual(held);
                }
            }
        }
    });
});
