import { describe, expect, it } from 'vitest';
import { diffViews, resultOf } from './diff';
import { c, view } from './fixtures/views';

const six = c('SIX', 'CLUBS');
const seven = c('SEVEN', 'CLUBS');

describe('diffViews', () => {
    it('reports duel_started and whose turn it is for the first view', () => {
        expect(diffViews(undefined, view())).toEqual([
            { type: 'duel_started' },
            { type: 'turn_started', yours: true },
        ]);
        expect(diffViews(undefined, view({ attacker: 'them' }))).toEqual([
            { type: 'duel_started' },
            { type: 'turn_started', yours: false },
        ]);
    });

    it('reports a new attack as card_played by the attacker', () => {
        const before = view();
        const after = view({
            table: [{ attack: six }],
            hand: before.hand.filter((card) => card !== six),
            version: 1,
        });

        expect(diffViews(before, after)).toContainEqual({ type: 'card_played', card: six, by: 'you' });
    });

    it('reports the opponent attacking', () => {
        const before = view({ attacker: 'them', phase: 'ATTACK' });
        const after = view({
            attacker: 'them',
            phase: 'DEFEND',
            table: [{ attack: seven }],
            opponentHandCount: 5,
        });

        expect(diffViews(before, after)).toContainEqual({ type: 'card_played', card: seven, by: 'opponent' });
    });

    it('reports a defence as card_beaten by the defender', () => {
        const before = view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: six }] });
        const after = view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: six, defence: seven }] });

        expect(diffViews(before, after)).toContainEqual({
            type: 'card_beaten',
            attack: six,
            defence: seven,
            by: 'you',
        });
    });

    it('reports a take when the table clears and the defender hand grows', () => {
        const before = view({
            attacker: 'them',
            phase: 'DEFEND',
            table: [{ attack: six }, { attack: seven }],
        });
        const after = view({ attacker: 'them', phase: 'ATTACK', hand: [...before.hand, six, seven] });

        const events = diffViews(before, after);
        expect(events).toContainEqual({ type: 'cards_taken', by: 'you', count: 2 });
        expect(events.find((event) => event.type === 'attack_ended')).toBeUndefined();
    });

    it('reports the opponent taking', () => {
        const before = view({
            phase: 'DEFEND',
            table: [{ attack: six, defence: seven }, { attack: c('SIX', 'HEARTS') }],
            opponentHandCount: 4,
        });
        const after = view({ opponentHandCount: 7, discardCount: 0 });

        expect(diffViews(before, after)).toContainEqual({ type: 'cards_taken', by: 'opponent', count: 3 });
    });

    it('reports attack_ended when the table clears into the discard', () => {
        const before = view({ table: [{ attack: six, defence: seven }] });
        const after = view({ attacker: 'them', discardCount: 2 });

        expect(diffViews(before, after)).toContainEqual({ type: 'attack_ended', count: 2 });
    });

    it('reports cards dealt to either side', () => {
        const before = view({ hand: view().hand.slice(0, 3), opponentHandCount: 3, talonCount: 10 });
        const after = view({ opponentHandCount: 6, talonCount: 5 });

        const events = diffViews(before, after);
        expect(events).toContainEqual({ type: 'card_dealt', count: 2, to: 'you' });
        expect(events).toContainEqual({ type: 'card_dealt', count: 3, to: 'opponent' });
    });

    it('reports turn_started when the mover changes', () => {
        const before = view({ table: [{ attack: six, defence: seven }] });
        const after = view({ attacker: 'them', discardCount: 2 });

        expect(diffViews(before, after)).toContainEqual({ type: 'turn_started', yours: false });
        expect(diffViews(after, { ...after, version: 2 })).not.toContainEqual(
            expect.objectContaining({ type: 'turn_started' }),
        );
    });

    it('reports duel_finished with the caller result', () => {
        const won = view({
            phase: 'FINISHED',
            outcome: { winner: 'me', loser: 'them', draw: false, reason: 'X' },
        });
        const lost = view({
            phase: 'FINISHED',
            outcome: { winner: 'them', loser: 'me', draw: false, reason: 'X' },
        });
        const draw = view({ phase: 'FINISHED', outcome: { draw: true, reason: 'X' } });

        expect(diffViews(view(), won)).toContainEqual({ type: 'duel_finished', result: 'WON' });
        expect(diffViews(view(), lost)).toContainEqual({ type: 'duel_finished', result: 'LOST' });
        expect(diffViews(view(), draw)).toContainEqual({ type: 'duel_finished', result: 'DRAW' });
        expect(resultOf(won)).toEqual({ result: 'WON', reason: 'X' });
    });
});
