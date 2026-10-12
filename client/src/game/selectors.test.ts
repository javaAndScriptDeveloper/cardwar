import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { cardId } from './cards';
import { c, view } from './fixtures/views';
import {
    beats,
    canAttackWith,
    canDefend,
    canEndAttack,
    canTake,
    playable,
    role,
    status,
    statusState,
    undefendedAttacks,
} from './selectors';

describe('beats', () => {
    it('mirrors DurakRules.beats', () => {
        expect(beats(c('SIX', 'CLUBS'), c('SEVEN', 'CLUBS'), 'HEARTS')).toBe(true);
        expect(beats(c('SEVEN', 'CLUBS'), c('SIX', 'CLUBS'), 'HEARTS')).toBe(false);
        expect(beats(c('ACE', 'CLUBS'), c('SIX', 'HEARTS'), 'HEARTS')).toBe(true);
        expect(beats(c('SIX', 'CLUBS'), c('ACE', 'SPADES'), 'HEARTS')).toBe(false);
        expect(beats(c('SIX', 'HEARTS'), c('ACE', 'CLUBS'), 'HEARTS')).toBe(false);
        expect(beats(c('SIX', 'HEARTS'), c('SEVEN', 'HEARTS'), 'HEARTS')).toBe(true);
    });
});

describe('as the attacker', () => {
    it('may lead any card on an empty table, but neither take nor end', () => {
        const v = view();
        expect(role(v)).toBe('attacker');
        expect(v.hand.every((card) => canAttackWith(v, card))).toBe(true);
        expect(canTake(v)).toBe(false);
        expect(canEndAttack(v)).toBe(false);
        expect(status(v, 'Bob')).toBe(t('duel.status.your-attack'));
    });

    it('may throw in only ranks on the table, even while the defender is still to answer', () => {
        const v = view({ phase: 'DEFEND', table: [{ attack: c('SIX', 'DIAMONDS') }] });
        expect(canAttackWith(v, c('SIX', 'CLUBS'))).toBe(true);
        expect(canAttackWith(v, c('NINE', 'SPADES'))).toBe(false);
        expect(canEndAttack(v)).toBe(false);
        expect(status(v, 'Bob')).toBe(t('duel.status.defending', { name: 'Bob' }));
    });

    it('counts defence ranks as on the table too', () => {
        const v = view({ table: [{ attack: c('EIGHT', 'SPADES'), defence: c('NINE', 'SPADES') }] });
        expect(canAttackWith(view({ ...v, hand: [c('NINE', 'CLUBS')] }), c('NINE', 'CLUBS'))).toBe(true);
        expect(canEndAttack(v)).toBe(true);
        expect(status(v, 'Bob')).toBe(t('duel.status.throw-in'));
    });

    it('stops at six attacks per round', () => {
        const six = Array.from({ length: 6 }, () => ({
            attack: c('SIX', 'SPADES'),
            defence: c('SEVEN', 'SPADES'),
        }));
        expect(canAttackWith(view({ table: six, opponentHandCount: 6 }), c('SIX', 'CLUBS'))).toBe(false);
    });

    it('stops when the defender could not answer another card', () => {
        const v = view({ phase: 'DEFEND', opponentHandCount: 1, table: [{ attack: c('SIX', 'DIAMONDS') }] });
        expect(canAttackWith(v, c('SIX', 'CLUBS'))).toBe(false);
    });

    it('rejects a card not in hand', () => {
        expect(canAttackWith(view(), c('KING', 'CLUBS'))).toBe(false);
    });
});

describe('as the defender', () => {
    it('defends undefended attacks with beating cards and may take', () => {
        const v = view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SEVEN', 'SPADES') }] });
        expect(role(v)).toBe('defender');
        expect(undefendedAttacks(v)).toEqual([c('SEVEN', 'SPADES')]);
        expect(canDefend(v, c('SEVEN', 'SPADES'), c('NINE', 'SPADES'))).toBe(true);
        expect(canDefend(v, c('SEVEN', 'SPADES'), c('SIX', 'HEARTS'))).toBe(true); // trump
        expect(canDefend(v, c('SEVEN', 'SPADES'), c('JACK', 'DIAMONDS'))).toBe(false);
        expect(canTake(v)).toBe(true);
        expect(canAttackWith(v, c('SIX', 'CLUBS'))).toBe(false);
        expect(status(v, 'Bob')).toBe(t('duel.status.defend'));
    });

    it('cannot defend an already beaten card, nor take when everything is beaten', () => {
        const v = view({
            attacker: 'them',
            phase: 'ATTACK',
            table: [{ attack: c('SEVEN', 'SPADES'), defence: c('NINE', 'SPADES') }],
        });
        expect(canDefend(v, c('SEVEN', 'SPADES'), c('ACE', 'HEARTS'))).toBe(false);
        expect(canTake(v)).toBe(false);
        expect(status(v, 'Bob')).toBe(t('duel.status.waiting', { name: 'Bob' }));
    });

    it('waits while the opponent leads', () => {
        expect(status(view({ attacker: 'them' }), 'Bob')).toBe(
            t('duel.status.waiting-attack', { name: 'Bob' }),
        );
    });
});

describe('playable', () => {
    it('marks hand cards with a legal use', () => {
        const v = view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SEVEN', 'SPADES') }] });
        expect(playable(v)).toEqual([c('SIX', 'HEARTS'), c('NINE', 'SPADES'), c('ACE', 'HEARTS')]);
        expect(playable(view({ phase: 'FINISHED' }))).toEqual([]);
    });

    it('nothing is playable once the duel is over', () => {
        const v = view({ phase: 'FINISHED', outcome: { draw: true, reason: 'DRAW' } });
        expect(canAttackWith(v, c('SIX', 'CLUBS'))).toBe(false);
        expect(status(v, 'Bob')).toBe(t('duel.status.over'));
    });
});

describe('statusState', () => {
    it("names the attacker's fresh turn", () => {
        expect(statusState(view())).toBe('your-attack');
    });

    it("names the defender's open attack", () => {
        expect(
            statusState(
                view({ attacker: 'them', phase: 'DEFEND', table: [{ attack: c('SIX', 'DIAMONDS') }] }),
            ),
        ).toBe('defend');
    });

    it('names the rest of the states', () => {
        expect(statusState(view({ phase: 'DEFEND', table: [{ attack: c('SIX', 'DIAMONDS') }] }))).toBe(
            'defending',
        );
        expect(
            statusState(view({ table: [{ attack: c('SIX', 'DIAMONDS'), defence: c('SEVEN', 'DIAMONDS') }] })),
        ).toBe('throw-in');
        expect(statusState(view({ attacker: 'them' }))).toBe('waiting-attack');
        expect(
            statusState(
                view({
                    attacker: 'them',
                    table: [{ attack: c('SIX', 'DIAMONDS'), defence: c('SEVEN', 'DIAMONDS') }],
                }),
            ),
        ).toBe('waiting');
        expect(statusState(view({ phase: 'FINISHED' }))).toBe('over');
    });
});

describe('cardId', () => {
    it('is RANK_OF_SUIT', () => {
        expect(cardId({ rank: 'SEVEN', suit: 'SPADES' })).toBe('SEVEN_OF_SPADES');
    });
});
