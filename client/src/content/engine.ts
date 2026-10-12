import type { DuelPhase, DuelResult } from '../api/types';
import { type Card, cardId } from '../game/cards';
import type { TableEvent } from '../game/diff';
import { ANIM_PRIMITIVES, BUILTIN_SOUNDS, CONDITIONS, HAPTICS, LAYOUTS, TARGETS, TRIGGERS } from './schema';
import type {
    AnimPrimitive,
    CardMatcher,
    Condition,
    Effect,
    LayoutKind,
    Localized,
    PackHaptic,
    PackManifest,
    Rule,
    Target,
} from './types';

type Side = 'you' | 'opponent';

/** Where a visual effect lands: an area of the table, or one card of a pair (pairs are keyed by their attack). */
export type Anchor =
    { area: 'hand' | 'table' | 'felt' | 'you' | 'opponent' } | { card: string; slot: 'attack' | 'defence' };

/** A resolved effect, ready for the runtime: names looked up, targets anchored. */
export type Action =
    | { kind: 'sound'; name: string }
    | { kind: 'css'; className: string; durationMs: number; anchor: Anchor }
    | { kind: 'motion'; primitive: AnimPrimitive; anchor: Anchor }
    | { kind: 'bubble'; text: Localized; anchor: Anchor }
    | { kind: 'haptic'; haptic: PackHaptic }
    | { kind: 'layout'; layout: LayoutKind; cards: string[] }
    /** Spoken at once; the anchor is where the line is shown when the device cannot speak it. */
    | { kind: 'say'; text: Localized; rate?: number; pitch?: number; anchor: Anchor };

export interface Firing {
    ruleId: string;
    actions: Action[];
}

export interface EngineContext {
    pack: PackManifest;
    /** Your hand as the latest view has it. */
    hand: readonly Card[];
    phase: DuelPhase | undefined;
    now: number;
    /** When each rule last fired, for cooldowns; the runtime records it. */
    lastFired: ReadonlyMap<string, number>;
    /** Uniform in [0, 1); seeded in tests. */
    random: () => number;
    /** Unknown vocabulary is reported here and skipped; the runtime warns once per message. */
    warn: (message: string) => void;
}

/** What an event says about the cards and sides involved, in the terms conditions and targets use. */
interface Facts {
    side?: Side;
    /** The card that just moved: the attack played, or the defence that beat. */
    card?: Card;
    /** The attack that was beaten. */
    beaten?: Card;
    /** The attacking card of the play or the beat. */
    attacker?: Card;
    outcome?: DuelResult;
    anchors: Partial<Record<Target, Anchor>>;
}

const AREAS = {
    hand: { area: 'hand' },
    table: { area: 'table' },
    felt: { area: 'felt' },
    you: { area: 'you' },
    opponent: { area: 'opponent' },
} as const;

function factsOf(event: TableEvent): Facts {
    const anchors: Facts['anchors'] = { ...AREAS };
    switch (event.type) {
        case 'card_played': {
            anchors.played = { card: cardId(event.card), slot: 'attack' };
            return { side: event.by, card: event.card, attacker: event.card, anchors };
        }
        case 'card_beaten': {
            const pair = cardId(event.attack);
            anchors.played = anchors.defence = { card: pair, slot: 'defence' };
            anchors.beaten = { card: pair, slot: 'attack' };
            return {
                side: event.by,
                card: event.defence,
                beaten: event.attack,
                attacker: event.attack,
                anchors,
            };
        }
        case 'turn_started':
            return { side: event.yours ? 'you' : 'opponent', anchors };
        case 'card_dealt':
            return { side: event.to, anchors };
        case 'cards_taken':
        case 'emote_received':
            return { side: event.by, anchors };
        case 'hand_changed':
            return { side: 'you', anchors };
        case 'duel_finished':
            return { outcome: event.result, anchors };
        case 'duel_started':
        case 'attack_ended':
            return { anchors };
    }
}

function matches(card: Card | undefined, matcher: CardMatcher, pack: PackManifest): boolean {
    if (!card) {
        return false;
    }
    const id = cardId(card);
    return (
        (matcher.id === undefined || matcher.id === id) &&
        (matcher.rank === undefined || matcher.rank === card.rank) &&
        (matcher.suit === undefined || matcher.suit === card.suit) &&
        (matcher.tag === undefined || (pack.cards[id]?.tags ?? []).includes(matcher.tag))
    );
}

const KNOWN_CONDITIONS: readonly string[] = CONDITIONS;

/**
 * Whether every key of `when` holds. The dice are rolled last, and only when everything else held, so a seeded
 * generator gives the same sequence for the same game. An unknown key never matches: firing a cosmetic on the
 * wrong event is worse than not firing it.
 */
function holds(when: Condition, facts: Facts, context: EngineContext): boolean {
    for (const key of Object.keys(when)) {
        if (!KNOWN_CONDITIONS.includes(key)) {
            context.warn(`content: unknown condition "${key}" skipped`);
            return false;
        }
    }
    const held = new Set(context.hand.map(cardId));
    const ok =
        (when.side === undefined || when.side === facts.side) &&
        (when.card === undefined || matches(facts.card, when.card, context.pack)) &&
        (when.beaten === undefined || matches(facts.beaten, when.beaten, context.pack)) &&
        (when.attacker === undefined || matches(facts.attacker, when.attacker, context.pack)) &&
        (when.handHas === undefined || when.handHas.every((id) => held.has(id))) &&
        (when.phase === undefined || when.phase === context.phase) &&
        (when.outcome === undefined || when.outcome === facts.outcome) &&
        (when.all === undefined || when.all.every((nested) => holds(nested, facts, context))) &&
        (when.any === undefined || when.any.some((nested) => holds(nested, facts, context)));
    return ok && (when.random === undefined || context.random() < when.random);
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

function anchorFor(target: unknown, facts: Facts, warn: (message: string) => void): Anchor | undefined {
    if (target === undefined) {
        return facts.anchors.played ?? facts.anchors.table;
    }
    const anchor = oneOf(TARGETS, target) ? facts.anchors[target] : undefined;
    if (!anchor) {
        warn(`content: target "${String(target)}" has nothing to point at on this event`);
    }
    return anchor;
}

function resolve(effect: Effect, facts: Facts, context: EngineContext): Action | undefined {
    const { pack, warn } = context;
    const raw = effect as Record<string, unknown>;
    if ('sound' in raw) {
        const name = raw['sound'];
        if (typeof name === 'string' && pack.sounds?.[name] !== undefined) {
            return { kind: 'sound', name: `${pack.id}:${name}` };
        }
        if (oneOf(BUILTIN_SOUNDS, name)) {
            return { kind: 'sound', name };
        }
        warn(`content: unknown sound "${String(name)}" skipped`);
        return undefined;
    }
    if ('anim' in raw) {
        const name = raw['anim'];
        const css = typeof name === 'string' ? pack.animations?.[name] : undefined;
        if (!css && !oneOf(ANIM_PRIMITIVES, name)) {
            warn(`content: unknown animation "${String(name)}" skipped`);
            return undefined;
        }
        const anchor = anchorFor(raw['target'], facts, warn);
        if (!anchor) {
            return undefined;
        }
        return css
            ? { kind: 'css', className: css.className, durationMs: css.durationMs, anchor }
            : { kind: 'motion', primitive: name as AnimPrimitive, anchor };
    }
    if ('bubble' in raw) {
        const anchor = anchorFor(raw['target'], facts, warn);
        return anchor && { kind: 'bubble', text: raw['bubble'] as Localized, anchor };
    }
    if ('haptic' in raw) {
        if (oneOf(HAPTICS, raw['haptic'])) {
            return { kind: 'haptic', haptic: raw['haptic'] };
        }
        warn(`content: unknown haptic "${String(raw['haptic'])}" skipped`);
        return undefined;
    }
    if ('say' in raw) {
        const rate = raw['rate'];
        const pitch = raw['pitch'];
        return {
            kind: 'say',
            text: raw['say'] as Localized,
            ...(typeof rate === 'number' ? { rate } : {}),
            ...(typeof pitch === 'number' ? { pitch } : {}),
            anchor: AREAS.table,
        };
    }
    if ('layout' in raw) {
        if (oneOf(LAYOUTS, raw['layout']) && Array.isArray(raw['cards'])) {
            return { kind: 'layout', layout: raw['layout'], cards: raw['cards'] as string[] };
        }
        warn(`content: unknown layout "${String(raw['layout'])}" skipped`);
        return undefined;
    }
    warn(`content: unknown effect ${JSON.stringify(effect)} skipped`);
    return undefined;
}

const KNOWN_TRIGGERS: readonly string[] = TRIGGERS;

/**
 * The rule engine: which rules an event fires and what they do. Pure (time, dice and cooldown history come in
 * through the context) and cosmetic by contract: an action can make noise, move pixels or reorder the hand, and
 * nothing here can send a move.
 */
export function evaluate(rules: readonly Rule[], event: TableEvent, context: EngineContext): Firing[] {
    const facts = factsOf(event);
    const firings: Firing[] = [];
    for (const rule of rules) {
        if (!KNOWN_TRIGGERS.includes(rule.on)) {
            context.warn(`content: unknown trigger "${String(rule.on)}" skipped (rule ${rule.id})`);
            continue;
        }
        if (rule.on !== event.type) {
            continue;
        }
        const last = context.lastFired.get(rule.id);
        if (rule.cooldownMs !== undefined && last !== undefined && context.now - last < rule.cooldownMs) {
            continue;
        }
        if (rule.if && !holds(rule.if, facts, context)) {
            continue;
        }
        const actions = rule.do
            .map((effect) => resolve(effect, facts, context))
            .filter((action): action is Action => action !== undefined);
        if (actions.length > 0) {
            firings.push({ ruleId: rule.id, actions });
        }
    }
    return firings;
}

/** mulberry32: a tiny seedable generator for reproducible tests of `random` conditions. */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
