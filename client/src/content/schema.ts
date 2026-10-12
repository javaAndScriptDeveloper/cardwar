/**
 * The pack vocabulary and a hand-written validator for `pack.json`. This module has no runtime imports and uses only
 * erasable TypeScript, so `scripts/packs-check.mjs` runs it directly under Node; the browser loader runs the same
 * code. `packs.schema.json` documents the same shape for editors, and a test keeps the two vocabularies equal.
 */

export const TRIGGERS = [
    'duel_started',
    'turn_started',
    'card_dealt',
    'card_played',
    'card_beaten',
    'cards_taken',
    'attack_ended',
    'hand_changed',
    'emote_received',
    'duel_finished',
] as const;

export const CONDITIONS = [
    'side',
    'card',
    'beaten',
    'attacker',
    'handHas',
    'phase',
    'outcome',
    'random',
    'all',
    'any',
] as const;

export const EFFECTS = ['sound', 'anim', 'bubble', 'haptic', 'layout'] as const;
export const TARGETS = ['played', 'beaten', 'defence', 'hand', 'table', 'you', 'opponent'] as const;
export const HAPTICS = ['success', 'error', 'warning', 'tap'] as const;
export const LAYOUTS = ['stick_together', 'pin_left', 'pin_right'] as const;
/** Motion primitives a rule may name; `glide` needs two rects, so it is not a rule effect. */
export const ANIM_PRIMITIVES = ['flip', 'beat', 'take', 'discard', 'deal', 'shake', 'pulse'] as const;
/** The default sound pack; a rule may play these without the pack shipping its own. */
export const BUILTIN_SOUNDS = ['slide', 'beat', 'take', 'deal', 'turn', 'win', 'lose'] as const;
export const SIDES = ['you', 'opponent'] as const;
export const PHASES = ['ATTACK', 'DEFEND', 'FINISHED'] as const;
export const OUTCOMES = ['WON', 'LOST', 'DRAW'] as const;

const RANK_NAMES = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'] as const;
const SUIT_NAMES = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as const;
/** Every card id as the client spells it (`cardId`): "SEVEN_OF_SPADES". */
export const CARD_IDS: readonly string[] = SUIT_NAMES.flatMap((suit) =>
    RANK_NAMES.map((rank) => `${rank}_OF_${suit}`),
);

export interface ValidationResult {
    errors: string[];
    /** Unknown vocabulary when not strict: the runtime skips it, so the pack still loads. */
    warnings: string[];
}

export interface ValidateOptions {
    /** Unknown keys, triggers, conditions and effects are errors (the build check) rather than warnings (runtime). */
    strict: boolean;
    /** Whether a path relative to the pack folder exists; omitted, files are not checked. */
    exists?: (path: string) => boolean;
}

type Json = Record<string, unknown>;

const ID = /^[a-z0-9][a-z0-9-]*$/;
const NAME = /^[a-z0-9_]+$/;
const TAG = /^[a-z0-9_-]+$/;
const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const TOP_LEVEL = [
    'id',
    'version',
    'type',
    'name',
    'back',
    'styles',
    'cards',
    'sounds',
    'animations',
    'rules',
];
const RULE_KEYS = ['id', 'on', 'if', 'do', 'cooldownMs'];
const MATCHER_KEYS = ['id', 'rank', 'suit', 'tag'];
const MAX_DURATION_MS = 10_000;

const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = (list: readonly string[], value: unknown): boolean =>
    typeof value === 'string' && list.includes(value);
const isLocalized = (value: unknown): boolean =>
    isObject(value) && typeof value['uk'] === 'string' && value['uk'].trim().length > 0;
const quote = (list: readonly string[]) => list.map((item) => `"${item}"`).join(', ');

/** A path inside the pack's folder tree: relative, no scheme. `..` is allowed so `classic` can point at /cards. */
function isRelativePath(value: unknown): value is string {
    return (
        typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !/^[a-z]+:/i.test(value)
    );
}

export function validatePack(json: unknown, options: ValidateOptions): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fail = (path: string, message: string) => errors.push(`${path}: ${message}`);
    const unknown = (path: string, message: string) =>
        (options.strict ? errors : warnings).push(`${path}: ${message}`);
    const file = (path: string, value: unknown) => {
        if (!isRelativePath(value)) {
            fail(path, 'expected a relative path');
        } else if (options.exists && !options.exists(value)) {
            fail(path, `file not found: ${value}`);
        }
    };

    if (!isObject(json)) {
        return { errors: ['$: expected an object'], warnings };
    }
    for (const key of Object.keys(json)) {
        if (!TOP_LEVEL.includes(key)) {
            unknown(key, 'unknown key');
        }
    }
    if (typeof json['id'] !== 'string' || !ID.test(json['id'])) {
        fail('id', 'expected lowercase letters, digits and dashes');
    }
    if (json['version'] !== 1) {
        fail('version', 'expected 1');
    }
    if (json['type'] !== 'DECK') {
        fail('type', 'expected "DECK"');
    }
    if (!isLocalized(json['name'])) {
        fail('name', 'expected { "uk": "..." }');
    }
    if (json['back'] !== undefined) {
        file('back', json['back']);
    }
    if (json['styles'] !== undefined) {
        file('styles', json['styles']);
    }

    const cards = json['cards'];
    if (!isObject(cards)) {
        fail('cards', 'expected an object');
    } else {
        for (const [id, card] of Object.entries(cards)) {
            const path = `cards.${id}`;
            if (!CARD_IDS.includes(id)) {
                fail(path, 'unknown card id');
                continue;
            }
            if (!isObject(card)) {
                fail(path, 'expected an object');
                continue;
            }
            file(`${path}.image`, card['image']);
            if (card['title'] !== undefined && !isLocalized(card['title'])) {
                fail(`${path}.title`, 'expected { "uk": "..." }');
            }
            const tags = card['tags'];
            if (tags !== undefined) {
                if (!Array.isArray(tags)) {
                    fail(`${path}.tags`, 'expected an array');
                } else {
                    tags.forEach((tag, i) => {
                        if (typeof tag !== 'string' || !TAG.test(tag)) {
                            fail(`${path}.tags[${i}]`, 'expected lowercase letters, digits, _ and -');
                        }
                    });
                }
            }
        }
        // A deck replaces every face; a missing one would silently fall back to classic mid-game.
        for (const id of CARD_IDS) {
            if (!(id in cards)) {
                errors.push(`cards: missing ${id}`);
            }
        }
    }

    const sounds = json['sounds'];
    const soundNames: string[] = [...BUILTIN_SOUNDS];
    if (sounds !== undefined) {
        if (!isObject(sounds)) {
            fail('sounds', 'expected an object');
        } else {
            for (const [name, path] of Object.entries(sounds)) {
                if (!NAME.test(name)) {
                    fail(`sounds.${name}`, 'expected a name of lowercase letters, digits and _');
                }
                file(`sounds.${name}`, path);
                soundNames.push(name);
            }
        }
    }

    const animations = json['animations'];
    const animNames: string[] = [...ANIM_PRIMITIVES];
    if (animations !== undefined) {
        if (!isObject(animations)) {
            fail('animations', 'expected an object');
        } else {
            for (const [name, anim] of Object.entries(animations)) {
                const path = `animations.${name}`;
                animNames.push(name);
                if (!NAME.test(name)) {
                    fail(path, 'expected a name of lowercase letters, digits and _');
                }
                if (!isObject(anim)) {
                    fail(path, 'expected an object');
                    continue;
                }
                if (anim['kind'] !== 'css') {
                    fail(`${path}.kind`, 'expected "css"');
                }
                if (typeof anim['className'] !== 'string' || !CLASS_NAME.test(anim['className'])) {
                    fail(`${path}.className`, 'expected one CSS class name');
                }
                const ms = anim['durationMs'];
                if (typeof ms !== 'number' || !Number.isInteger(ms) || ms <= 0 || ms > MAX_DURATION_MS) {
                    fail(`${path}.durationMs`, `expected an integer in 1..${MAX_DURATION_MS}`);
                }
            }
        }
    }

    const matcher = (path: string, value: unknown) => {
        if (!isObject(value)) {
            fail(path, 'expected an object');
            return;
        }
        for (const [key, item] of Object.entries(value)) {
            const at = `${path}.${key}`;
            if (!MATCHER_KEYS.includes(key)) {
                fail(at, `unknown matcher key (expected ${quote(MATCHER_KEYS)})`);
            } else if (key === 'id' && !oneOf(CARD_IDS, item)) {
                fail(at, 'unknown card id');
            } else if (key === 'rank' && !oneOf(RANK_NAMES, item)) {
                fail(at, `expected one of ${quote(RANK_NAMES)}`);
            } else if (key === 'suit' && !oneOf(SUIT_NAMES, item)) {
                fail(at, `expected one of ${quote(SUIT_NAMES)}`);
            } else if (key === 'tag' && (typeof item !== 'string' || !TAG.test(item))) {
                fail(at, 'expected a tag');
            }
        }
    };

    const cardList = (path: string, value: unknown, min: number) => {
        if (!Array.isArray(value) || value.length < min) {
            fail(path, `expected an array of at least ${min} card id${min === 1 ? '' : 's'}`);
            return;
        }
        value.forEach((id, i) => {
            if (!oneOf(CARD_IDS, id)) {
                fail(`${path}[${i}]`, 'unknown card id');
            }
        });
    };

    const condition = (path: string, value: unknown) => {
        if (!isObject(value)) {
            fail(path, 'expected an object');
            return;
        }
        for (const [key, item] of Object.entries(value)) {
            const at = `${path}.${key}`;
            switch (key) {
                case 'side':
                    if (!oneOf(SIDES, item)) fail(at, `expected one of ${quote(SIDES)}`);
                    break;
                case 'card':
                case 'beaten':
                case 'attacker':
                    matcher(at, item);
                    break;
                case 'handHas':
                    cardList(at, item, 1);
                    break;
                case 'phase':
                    if (!oneOf(PHASES, item)) fail(at, `expected one of ${quote(PHASES)}`);
                    break;
                case 'outcome':
                    if (!oneOf(OUTCOMES, item)) fail(at, `expected one of ${quote(OUTCOMES)}`);
                    break;
                case 'random':
                    if (typeof item !== 'number' || item < 0 || item > 1)
                        fail(at, 'expected a number in 0..1');
                    break;
                case 'all':
                case 'any':
                    if (!Array.isArray(item)) {
                        fail(at, 'expected an array of conditions');
                    } else {
                        item.forEach((nested, i) => condition(`${at}[${i}]`, nested));
                    }
                    break;
                default:
                    unknown(at, 'unknown condition');
            }
        }
    };

    const effect = (path: string, value: unknown) => {
        if (!isObject(value)) {
            fail(path, 'expected an object');
            return;
        }
        const kinds = EFFECTS.filter((kind) => kind in value);
        if (kinds.length === 0) {
            unknown(path, 'unknown effect');
            return;
        }
        if (kinds.length > 1) {
            fail(path, `expected exactly one of ${quote(EFFECTS)}`);
            return;
        }
        const target = value['target'];
        if (target !== undefined && !oneOf(TARGETS, target)) {
            fail(`${path}.target`, `expected one of ${quote(TARGETS)}`);
        }
        switch (kinds[0]) {
            case 'sound':
                if (!oneOf(soundNames, value['sound'])) {
                    fail(`${path}.sound`, `unknown sound "${String(value['sound'])}"`);
                }
                break;
            case 'anim':
                if (!oneOf(animNames, value['anim'])) {
                    fail(`${path}.anim`, `unknown animation "${String(value['anim'])}"`);
                }
                break;
            case 'bubble':
                if (!isLocalized(value['bubble'])) {
                    fail(`${path}.bubble`, 'expected { "uk": "..." }');
                }
                break;
            case 'haptic':
                if (!oneOf(HAPTICS, value['haptic'])) {
                    fail(`${path}.haptic`, `expected one of ${quote(HAPTICS)}`);
                }
                break;
            case 'layout':
                if (!oneOf(LAYOUTS, value['layout'])) {
                    fail(`${path}.layout`, `expected one of ${quote(LAYOUTS)}`);
                }
                cardList(`${path}.cards`, value['cards'], value['layout'] === 'stick_together' ? 2 : 1);
                break;
        }
    };

    const rules = json['rules'];
    if (rules !== undefined) {
        if (!Array.isArray(rules)) {
            fail('rules', 'expected an array');
        } else {
            const ids = new Set<string>();
            rules.forEach((rule, i) => {
                const path = `rules[${i}]`;
                if (!isObject(rule)) {
                    fail(path, 'expected an object');
                    return;
                }
                for (const key of Object.keys(rule)) {
                    if (!RULE_KEYS.includes(key)) {
                        unknown(`${path}.${key}`, 'unknown key');
                    }
                }
                const id = rule['id'];
                if (typeof id !== 'string' || !ID.test(id)) {
                    fail(`${path}.id`, 'expected lowercase letters, digits and dashes');
                } else if (ids.has(id)) {
                    fail(`${path}.id`, 'duplicate');
                } else {
                    ids.add(id);
                }
                if (!oneOf(TRIGGERS, rule['on'])) {
                    unknown(`${path}.on`, `unknown trigger "${String(rule['on'])}"`);
                }
                if (rule['if'] !== undefined) {
                    condition(`${path}.if`, rule['if']);
                }
                const effects = rule['do'];
                if (!Array.isArray(effects) || effects.length === 0) {
                    fail(`${path}.do`, 'expected a non-empty array');
                } else {
                    effects.forEach((item, j) => effect(`${path}.do[${j}]`, item));
                }
                const cooldown = rule['cooldownMs'];
                if (cooldown !== undefined && (typeof cooldown !== 'number' || cooldown < 0)) {
                    fail(`${path}.cooldownMs`, 'expected a non-negative number');
                }
            });
        }
    }
    return { errors, warnings };
}
