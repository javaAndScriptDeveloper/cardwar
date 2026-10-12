import type { ANIM_PRIMITIVES, HAPTICS, LAYOUTS, OUTCOMES, PHASES, SIDES, TARGETS, TRIGGERS } from './schema';

/** Types of a validated `pack.json` (see `schema.ts` for the rules and `packs.schema.json` for editors). */

export type Trigger = (typeof TRIGGERS)[number];
export type Target = (typeof TARGETS)[number];
export type PackHaptic = (typeof HAPTICS)[number];
export type LayoutKind = (typeof LAYOUTS)[number];
export type AnimPrimitive = (typeof ANIM_PRIMITIVES)[number];
export type PackSide = (typeof SIDES)[number];
export type PackPhase = (typeof PHASES)[number];
export type PackOutcome = (typeof OUTCOMES)[number];

/** All copy in a pack is per locale; Ukrainian is the only one shipped. */
export interface Localized {
    uk: string;
}

export interface PackCard {
    /** Relative to the pack folder. */
    image: string;
    title?: Localized;
    tags?: string[];
}

export interface CssAnimation {
    kind: 'css';
    /** Defined in the pack's `styles`; toggled on the target for `durationMs`. */
    className: string;
    durationMs: number;
}

export interface CardMatcher {
    id?: string;
    rank?: string;
    suit?: string;
    tag?: string;
}

/** Every key present must hold. */
export interface Condition {
    side?: PackSide;
    card?: CardMatcher;
    beaten?: CardMatcher;
    attacker?: CardMatcher;
    handHas?: string[];
    phase?: PackPhase;
    outcome?: PackOutcome;
    /** Probability in 0..1. */
    random?: number;
    all?: Condition[];
    any?: Condition[];
}

export type Effect =
    | { sound: string }
    | { anim: string; target?: Target }
    | { bubble: Localized; target?: Target }
    | { haptic: PackHaptic }
    | { layout: LayoutKind; cards: string[] };

export interface Rule {
    id: string;
    on: Trigger;
    if?: Condition;
    do: Effect[];
    cooldownMs?: number;
}

export interface PackManifest {
    id: string;
    version: 1;
    type: 'DECK';
    name: Localized;
    back?: string;
    styles?: string;
    cards: Record<string, PackCard>;
    sounds?: Record<string, string>;
    animations?: Record<string, CssAnimation>;
    rules?: Rule[];
}

/** One entry of `/app/packs/index.json`, written by `npm run packs:check`. */
export interface PackIndexEntry {
    id: string;
    name: Localized;
    /** A few face URLs relative to the app base, for the deck picker. */
    preview: string[];
    /** The sound the shop plays when the deck's preview is tapped, relative to the app base; absent if silent. */
    demoSound?: string;
}
