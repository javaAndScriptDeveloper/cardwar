import type { DuelView } from '../../api/types';
import type { Card, Rank, Suit } from '../cards';

export const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

/** A view from "me" at the start of a duel where I attack; override fields per test. */
export function view(overrides: Partial<DuelView> = {}): DuelView {
    return {
        duelId: 'duel-1',
        you: 'me',
        opponent: 'them',
        hand: [
            c('SIX', 'CLUBS'),
            c('SIX', 'HEARTS'),
            c('NINE', 'SPADES'),
            c('JACK', 'DIAMONDS'),
            c('ACE', 'HEARTS'),
        ],
        opponentHandCount: 6,
        talonCount: 24,
        trumpCard: c('TEN', 'HEARTS'),
        trumpSuit: 'HEARTS',
        table: [],
        discardCount: 0,
        attacker: 'me',
        phase: 'ATTACK',
        version: 0,
        stake: 0,
        ...overrides,
    };
}
