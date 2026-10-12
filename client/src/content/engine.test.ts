import { describe, expect, it, vi } from 'vitest';
import type { TableEvent } from '../game/diff';
import { c } from '../game/fixtures/views';
import { type EngineContext, evaluate, seededRandom } from './engine';
import { CARD_IDS, TRIGGERS } from './schema';
import type { Condition, Effect, PackManifest, Rule, Target } from './types';

const ACE_H = c('ACE', 'HEARTS');
const SIX_C = c('SIX', 'CLUBS');
const KING_S = c('KING', 'SPADES');
const JACK_S = c('JACK', 'SPADES');

const pack: PackManifest = {
    id: 'demo',
    version: 1,
    type: 'DECK',
    name: { uk: 'Демо' },
    cards: {
        ...Object.fromEntries(CARD_IDS.map((id) => [id, { image: `cards/${id}.svg` }])),
        ACE_OF_HEARTS: { image: 'a.svg', tags: ['banker', 'rich'] },
        SIX_OF_CLUBS: { image: 's.svg', tags: ['cat'] },
    },
    sounds: { boom: 'sounds/boom.wav' },
    animations: { rain: { kind: 'css', className: 'fx-rain', durationMs: 900 } },
};

function ctx(overrides: Partial<EngineContext> = {}): EngineContext {
    return {
        pack,
        hand: [KING_S, SIX_C, JACK_S],
        phase: 'ATTACK',
        now: 10_000,
        lastFired: new Map(),
        random: () => 0.5,
        warn: () => {},
        ...overrides,
    };
}

const rule = (
    on: Rule['on'],
    when: Condition | undefined,
    effects: Effect[] = [{ sound: 'boom' }],
): Rule => ({
    id: 'r',
    on,
    ...(when && { if: when }),
    do: effects,
});

const fires = (r: Rule, event: TableEvent, context = ctx()) => evaluate([r], event, context).length === 1;

/** One example of every trigger, keyed by its type. */
const EVENTS: Record<(typeof TRIGGERS)[number], TableEvent> = {
    duel_started: { type: 'duel_started' },
    turn_started: { type: 'turn_started', yours: true },
    card_dealt: { type: 'card_dealt', count: 2, to: 'opponent' },
    card_played: { type: 'card_played', card: SIX_C, by: 'opponent' },
    card_beaten: { type: 'card_beaten', attack: ACE_H, defence: SIX_C, by: 'you' },
    cards_taken: { type: 'cards_taken', by: 'you', count: 2 },
    attack_ended: { type: 'attack_ended', count: 2 },
    hand_changed: { type: 'hand_changed', hand: [KING_S] },
    emote_received: { type: 'emote_received', emote: 'laugh', by: 'opponent' },
    duel_finished: { type: 'duel_finished', result: 'WON' },
};

describe('evaluate: triggers', () => {
    it.each(TRIGGERS)('a rule on %s fires on that event and no other', (trigger) => {
        for (const [type, event] of Object.entries(EVENTS)) {
            expect(fires(rule(trigger, undefined), event), `${trigger} on ${type}`).toBe(type === trigger);
        }
    });

    it('skips a rule with an unknown trigger and warns', () => {
        const warn = vi.fn();
        const unknown = { ...rule('card_played', undefined), on: 'card_exploded' } as unknown as Rule;
        expect(evaluate([unknown], EVENTS.card_played, ctx({ warn }))).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('card_exploded'));
    });

    it('returns every matching rule, in pack order, with its id', () => {
        const a = { ...rule('card_played', undefined), id: 'a' };
        const b = { ...rule('card_played', undefined, [{ haptic: 'tap' }]), id: 'b' };
        expect(evaluate([a, b], EVENTS.card_played, ctx())).toEqual([
            { ruleId: 'a', actions: [{ kind: 'sound', name: 'demo:boom' }] },
            { ruleId: 'b', actions: [{ kind: 'haptic', haptic: 'tap' }] },
        ]);
    });
});

describe('evaluate: conditions', () => {
    it.each<[string, TableEvent, Condition, boolean]>([
        // side: who acted, who was dealt, whose turn, whose hand.
        ['side opponent played', EVENTS.card_played, { side: 'opponent' }, true],
        ['side you, opponent played', EVENTS.card_played, { side: 'you' }, false],
        ['side you beat', EVENTS.card_beaten, { side: 'you' }, true],
        ['side you took', EVENTS.cards_taken, { side: 'you' }, true],
        ['side dealt to opponent', EVENTS.card_dealt, { side: 'opponent' }, true],
        ['side your turn', EVENTS.turn_started, { side: 'you' }, true],
        ['side their turn', { type: 'turn_started', yours: false }, { side: 'opponent' }, true],
        ['side your hand', EVENTS.hand_changed, { side: 'you' }, true],
        ['side emote by opponent', EVENTS.emote_received, { side: 'opponent' }, true],
        ['side on an event without one', EVENTS.duel_started, { side: 'you' }, false],
        // card: the card that just moved (the attack played, or the defence).
        ['card id played', EVENTS.card_played, { card: { id: 'SIX_OF_CLUBS' } }, true],
        ['card id other', EVENTS.card_played, { card: { id: 'ACE_OF_HEARTS' } }, false],
        ['card rank', EVENTS.card_played, { card: { rank: 'SIX' } }, true],
        ['card suit', EVENTS.card_played, { card: { suit: 'HEARTS' } }, false],
        ['card tag', EVENTS.card_played, { card: { tag: 'cat' } }, true],
        ['card tag missing', EVENTS.card_played, { card: { tag: 'banker' } }, false],
        ['card is the defence when beating', EVENTS.card_beaten, { card: { id: 'SIX_OF_CLUBS' } }, true],
        ['card with no card in the event', EVENTS.cards_taken, { card: { rank: 'SIX' } }, false],
        ['card matcher keys all hold', EVENTS.card_played, { card: { rank: 'SIX', suit: 'HEARTS' } }, false],
        // beaten: the attack that got beaten; attacker: the attacking card.
        ['beaten tag', EVENTS.card_beaten, { beaten: { tag: 'banker' } }, true],
        ['beaten second tag', EVENTS.card_beaten, { beaten: { tag: 'rich' } }, true],
        ['beaten rank', EVENTS.card_beaten, { beaten: { rank: 'SIX' } }, false],
        ['beaten on a play', EVENTS.card_played, { beaten: { rank: 'SIX' } }, false],
        ['attacker when beaten', EVENTS.card_beaten, { attacker: { id: 'ACE_OF_HEARTS' } }, true],
        ['attacker when played', EVENTS.card_played, { attacker: { suit: 'CLUBS' } }, true],
        ['attacker on a deal', EVENTS.card_dealt, { attacker: { suit: 'CLUBS' } }, false],
        // handHas: the current hand from the context.
        ['handHas both', EVENTS.hand_changed, { handHas: ['KING_OF_SPADES', 'JACK_OF_SPADES'] }, true],
        ['handHas one missing', EVENTS.hand_changed, { handHas: ['KING_OF_SPADES', 'ACE_OF_HEARTS'] }, false],
        // phase and outcome.
        ['phase', EVENTS.card_played, { phase: 'ATTACK' }, true],
        ['phase other', EVENTS.card_played, { phase: 'DEFEND' }, false],
        ['outcome', EVENTS.duel_finished, { outcome: 'WON' }, true],
        ['outcome other', EVENTS.duel_finished, { outcome: 'LOST' }, false],
        ['outcome before the end', EVENTS.card_played, { outcome: 'WON' }, false],
        // random against the context's 0.5.
        ['random above the roll', EVENTS.card_played, { random: 0.6 }, true],
        ['random below the roll', EVENTS.card_played, { random: 0.4 }, false],
        ['random 1 always', EVENTS.card_played, { random: 1 }, true],
        ['random 0 never', EVENTS.card_played, { random: 0 }, false],
        // all / any, nested.
        ['all hold', EVENTS.card_played, { all: [{ side: 'opponent' }, { card: { tag: 'cat' } }] }, true],
        ['all, one fails', EVENTS.card_played, { all: [{ side: 'opponent' }, { side: 'you' }] }, false],
        ['all empty', EVENTS.card_played, { all: [] }, true],
        ['any, one holds', EVENTS.card_played, { any: [{ side: 'you' }, { phase: 'ATTACK' }] }, true],
        ['any, none hold', EVENTS.card_played, { any: [{ side: 'you' }, { phase: 'DEFEND' }] }, false],
        ['any empty', EVENTS.card_played, { any: [] }, false],
        ['nested', EVENTS.card_played, { any: [{ all: [{ side: 'opponent' }, { phase: 'ATTACK' }] }] }, true],
        [
            'every key of one condition holds',
            EVENTS.card_played,
            { side: 'opponent', phase: 'DEFEND' },
            false,
        ],
    ])('%s', (_, event, when, expected) => {
        expect(fires(rule(event.type as Rule['on'], when), event)).toBe(expected);
    });

    it('treats an unknown condition as not matching, with a warning', () => {
        const warn = vi.fn();
        const when = { mood: 'happy' } as unknown as Condition;
        expect(fires(rule('card_played', when), EVENTS.card_played, ctx({ warn }))).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('mood'));
    });

    it('rolls the dice only when everything else holds, so seeded runs are reproducible', () => {
        const random = vi.fn(() => 0.1);
        fires(rule('card_played', { side: 'you', random: 0.5 }), EVENTS.card_played, ctx({ random }));
        expect(random).not.toHaveBeenCalled();
        fires(rule('card_played', { side: 'opponent', random: 0.5 }), EVENTS.card_played, ctx({ random }));
        expect(random).toHaveBeenCalledTimes(1);
    });

    it('fires a random rule at about its probability with a seeded generator', () => {
        const random = seededRandom(1234);
        const r = rule('card_played', { random: 0.25 });
        let hits = 0;
        for (let i = 0; i < 2000; i++) {
            hits += fires(r, EVENTS.card_played, ctx({ random })) ? 1 : 0;
        }
        expect(hits / 2000).toBeGreaterThan(0.2);
        expect(hits / 2000).toBeLessThan(0.3);
    });

    it('a seeded generator repeats itself', () => {
        const a = seededRandom(7);
        const b = seededRandom(7);
        const first = Array.from({ length: 5 }, () => a());
        expect(Array.from({ length: 5 }, () => b())).toEqual(first);
        expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    });
});

describe('evaluate: cooldown', () => {
    const cooled = { ...rule('card_played', undefined), cooldownMs: 4000 };

    it('fires when it never fired', () => {
        expect(fires(cooled, EVENTS.card_played, ctx())).toBe(true);
    });

    it('stays quiet inside the cooldown', () => {
        expect(fires(cooled, EVENTS.card_played, ctx({ lastFired: new Map([['r', 7000]]) }))).toBe(false);
    });

    it('fires again once the cooldown passed', () => {
        expect(fires(cooled, EVENTS.card_played, ctx({ lastFired: new Map([['r', 6000]]) }))).toBe(true);
    });

    it('ignores the last firing when the rule has no cooldown', () => {
        const free = rule('card_played', undefined);
        expect(fires(free, EVENTS.card_played, ctx({ lastFired: new Map([['r', 9999]]) }))).toBe(true);
    });
});

describe('evaluate: effects', () => {
    const run = (effects: Effect[], event: TableEvent = EVENTS.card_beaten, context = ctx()) =>
        evaluate([rule(event.type as Rule['on'], undefined, effects)], event, context)[0]?.actions;

    it('plays pack sounds under the pack id and default sounds by name', () => {
        expect(run([{ sound: 'boom' }, { sound: 'win' }])).toEqual([
            { kind: 'sound', name: 'demo:boom' },
            { kind: 'sound', name: 'win' },
        ]);
    });

    it('resolves pack css animations and motion primitives', () => {
        expect(
            run([
                { anim: 'rain', target: 'table' },
                { anim: 'shake', target: 'hand' },
            ]),
        ).toEqual([
            { kind: 'css', className: 'fx-rain', durationMs: 900, anchor: { area: 'table' } },
            { kind: 'motion', primitive: 'shake', anchor: { area: 'hand' } },
        ]);
    });

    it.each<[string, TableEvent, Target | undefined, unknown]>([
        ['played, on a play', EVENTS.card_played, 'played', { card: 'SIX_OF_CLUBS', slot: 'attack' }],
        [
            'played, on a beat, is the defence',
            EVENTS.card_beaten,
            'played',
            { card: 'ACE_OF_HEARTS', slot: 'defence' },
        ],
        ['beaten', EVENTS.card_beaten, 'beaten', { card: 'ACE_OF_HEARTS', slot: 'attack' }],
        ['defence', EVENTS.card_beaten, 'defence', { card: 'ACE_OF_HEARTS', slot: 'defence' }],
        ['hand', EVENTS.card_beaten, 'hand', { area: 'hand' }],
        ['table', EVENTS.card_beaten, 'table', { area: 'table' }],
        ['felt', EVENTS.card_beaten, 'felt', { area: 'felt' }],
        ['you', EVENTS.card_beaten, 'you', { area: 'you' }],
        ['opponent', EVENTS.card_beaten, 'opponent', { area: 'opponent' }],
        ['default with a card', EVENTS.card_played, undefined, { card: 'SIX_OF_CLUBS', slot: 'attack' }],
        ['default without a card', EVENTS.cards_taken, undefined, { area: 'table' }],
    ])('anchors target %s', (_, event, target, anchor) => {
        const effect = target ? { anim: 'beat', target } : { anim: 'beat' };
        expect(run([effect as Effect], event)).toEqual([{ kind: 'motion', primitive: 'beat', anchor }]);
    });

    it('drops a card target the event has no card for, with a warning', () => {
        const warn = vi.fn();
        expect(
            run([{ anim: 'beat', target: 'beaten' }, { haptic: 'tap' }], EVENTS.card_played, ctx({ warn })),
        ).toEqual([{ kind: 'haptic', haptic: 'tap' }]);
        expect(warn).toHaveBeenCalled();
    });

    it('shows bubbles at their anchor', () => {
        expect(run([{ bubble: { uk: 'Ой' }, target: 'beaten' }])).toEqual([
            { kind: 'bubble', text: { uk: 'Ой' }, anchor: { card: 'ACE_OF_HEARTS', slot: 'attack' } },
        ]);
    });

    it('resolves say lines with their rate and pitch, anchored to the table for the bubble fallback', () => {
        expect(run([{ say: { uk: 'Йоу' } }, { say: { uk: 'Мінус гроші' }, rate: 1.3, pitch: 0.7 }])).toEqual([
            { kind: 'say', text: { uk: 'Йоу' }, anchor: { area: 'table' } },
            { kind: 'say', text: { uk: 'Мінус гроші' }, rate: 1.3, pitch: 0.7, anchor: { area: 'table' } },
        ]);
    });

    it('passes haptics and layouts through', () => {
        expect(run([{ haptic: 'success' }, { layout: 'pin_left', cards: ['KING_OF_SPADES'] }])).toEqual([
            { kind: 'haptic', haptic: 'success' },
            { kind: 'layout', layout: 'pin_left', cards: ['KING_OF_SPADES'] },
        ]);
    });

    it('skips unknown effects and unknown names, keeping the rest, with warnings', () => {
        const warn = vi.fn();
        const effects = [
            { confetti: true },
            { sound: 'nope' },
            { anim: 'nope' },
            { haptic: 'boom' },
            { layout: 'spiral', cards: [] },
            { sound: 'boom' },
        ] as unknown as Effect[];
        expect(run(effects, EVENTS.card_beaten, ctx({ warn }))).toEqual([
            { kind: 'sound', name: 'demo:boom' },
        ]);
        expect(warn).toHaveBeenCalledTimes(5);
    });

    it('a rule whose effects all drop does not fire (and so does not start its cooldown)', () => {
        const effects = [{ confetti: true }] as unknown as Effect[];
        expect(evaluate([rule('card_played', undefined, effects)], EVENTS.card_played, ctx())).toEqual([]);
    });
});
