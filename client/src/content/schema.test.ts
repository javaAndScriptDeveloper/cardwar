import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ANIM_PRIMITIVES,
    BUILTIN_SOUNDS,
    CARD_IDS,
    CONDITIONS,
    EFFECTS,
    HAPTICS,
    LAYOUTS,
    TARGETS,
    TRIGGERS,
    packIndexEntry,
    validatePack,
} from './schema';

/** A minimal valid deck: every face, nothing else. */
function deck(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'test-deck',
        version: 1,
        type: 'DECK',
        name: { uk: 'Тестова колода' },
        cards: Object.fromEntries(CARD_IDS.map((id) => [id, { image: `cards/${id}.svg` }])),
        ...overrides,
    };
}

const withRule = (rule: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    deck({ rules: [{ id: 'r', on: 'card_played', do: [{ sound: 'slide' }], ...rule }], ...extra });

const errorsOf = (json: unknown) => validatePack(json, { strict: true }).errors;

describe('validatePack', () => {
    it('accepts a minimal deck', () => {
        expect(validatePack(deck(), { strict: true })).toEqual({ errors: [], warnings: [] });
    });

    it('accepts a deck using every trigger, condition, effect, target and layout', () => {
        const json = deck({
            back: 'cards/back.svg',
            styles: 'anim/fx.css',
            sounds: { boom: 'sounds/boom.wav' },
            animations: { rain: { kind: 'css', className: 'fx-rain', durationMs: 900 } },
            rules: [
                ...TRIGGERS.map((on, i) => ({ id: `t${i}`, on, do: [{ sound: 'boom' }] })),
                {
                    id: 'all-conditions',
                    on: 'card_beaten',
                    if: {
                        side: 'you',
                        card: { id: 'ACE_OF_HEARTS' },
                        beaten: { rank: 'SIX', suit: 'CLUBS' },
                        attacker: { tag: 'banker' },
                        handHas: ['KING_OF_SPADES'],
                        phase: 'DEFEND',
                        outcome: 'WON',
                        random: 0.5,
                        all: [{ side: 'opponent' }],
                        any: [{ random: 1 }, { phase: 'ATTACK' }],
                    },
                    do: [
                        ...TARGETS.map((target) => ({ anim: 'rain', target })),
                        ...ANIM_PRIMITIVES.map((anim) => ({ anim })),
                        ...BUILTIN_SOUNDS.map((sound) => ({ sound })),
                        ...HAPTICS.map((haptic) => ({ haptic })),
                        { bubble: { uk: 'Ой' }, target: 'beaten' },
                        ...LAYOUTS.map((layout) => ({ layout, cards: ['KING_OF_SPADES', 'JACK_OF_SPADES'] })),
                    ],
                    cooldownMs: 4000,
                },
            ],
        });
        expect(validatePack(json, { strict: true })).toEqual({ errors: [], warnings: [] });
    });

    it.each([
        ['not an object', 'nope', '$: expected an object'],
        ['bad id', deck({ id: 'Bad Id' }), 'id: expected'],
        ['wrong version', deck({ version: 2 }), 'version: expected 1'],
        ['wrong type', deck({ type: 'TABLE' }), 'type: expected "DECK"'],
        ['missing name', deck({ name: undefined }), 'name: expected { "uk": "..." }'],
        ['empty name', deck({ name: { uk: '' } }), 'name: expected { "uk": "..." }'],
        ['absolute back', deck({ back: '/etc/passwd' }), 'back: expected a relative path'],
        ['remote image', deck({ back: 'https://x.test/a.svg' }), 'back: expected a relative path'],
        ['cards not an object', deck({ cards: [] }), 'cards: expected an object'],
        [
            'unknown card id',
            deck({ cards: { ...(deck()['cards'] as object), JOKER: { image: 'j.svg' } } }),
            'cards.JOKER: unknown card id',
        ],
        [
            'card without image',
            deck({ cards: { ...(deck()['cards'] as object), SIX_OF_CLUBS: {} } }),
            'cards.SIX_OF_CLUBS.image',
        ],
        [
            'bad tag',
            deck({
                cards: {
                    ...(deck()['cards'] as object),
                    SIX_OF_CLUBS: { image: 'a.svg', tags: ['Bad Tag'] },
                },
            }),
            'cards.SIX_OF_CLUBS.tags[0]',
        ],
        [
            'bad title',
            deck({ cards: { ...(deck()['cards'] as object), SIX_OF_CLUBS: { image: 'a.svg', title: 'x' } } }),
            'cards.SIX_OF_CLUBS.title',
        ],
        ['bad sound path', deck({ sounds: { boom: 5 } }), 'sounds.boom: expected a relative path'],
        ['bad sound name', deck({ sounds: { 'Bo Om': 'a.wav' } }), 'sounds.Bo Om: expected a name'],
        [
            'animation kind',
            deck({ animations: { rain: { kind: 'lottie', className: 'x', durationMs: 1 } } }),
            'animations.rain.kind',
        ],
        [
            'animation class',
            deck({ animations: { rain: { kind: 'css', className: 'a b', durationMs: 1 } } }),
            'animations.rain.className',
        ],
        [
            'animation duration',
            deck({ animations: { rain: { kind: 'css', className: 'a', durationMs: 0 } } }),
            'animations.rain.durationMs',
        ],
        ['rules not an array', deck({ rules: {} }), 'rules: expected an array'],
        ['rule without id', withRule({ id: undefined }), 'rules[0].id'],
        [
            'duplicate rule id',
            deck({
                rules: [
                    { id: 'a', on: 'card_played', do: [{ sound: 'slide' }] },
                    { id: 'a', on: 'card_played', do: [{ sound: 'slide' }] },
                ],
            }),
            'rules[1].id: duplicate',
        ],
        ['empty do', withRule({ do: [] }), 'rules[0].do: expected a non-empty array'],
        ['negative cooldown', withRule({ cooldownMs: -1 }), 'rules[0].cooldownMs'],
        ['side value', withRule({ if: { side: 'both' } }), 'rules[0].if.side'],
        ['matcher id', withRule({ if: { card: { id: 'NOPE' } } }), 'rules[0].if.card.id'],
        ['matcher rank', withRule({ if: { beaten: { rank: 'TWO' } } }), 'rules[0].if.beaten.rank'],
        ['matcher suit', withRule({ if: { attacker: { suit: 'STARS' } } }), 'rules[0].if.attacker.suit'],
        ['matcher tag', withRule({ if: { card: { tag: 'A B' } } }), 'rules[0].if.card.tag'],
        ['matcher key', withRule({ if: { card: { colour: 'red' } } }), 'rules[0].if.card.colour'],
        ['handHas', withRule({ if: { handHas: 'KING_OF_SPADES' } }), 'rules[0].if.handHas'],
        ['handHas id', withRule({ if: { handHas: ['NOPE'] } }), 'rules[0].if.handHas[0]'],
        ['phase', withRule({ if: { phase: 'LUNCH' } }), 'rules[0].if.phase'],
        ['outcome', withRule({ if: { outcome: 'WIN' } }), 'rules[0].if.outcome'],
        ['random range', withRule({ if: { random: 2 } }), 'rules[0].if.random'],
        ['all shape', withRule({ if: { all: {} } }), 'rules[0].if.all'],
        ['nested any', withRule({ if: { any: [{ side: 'x' }] } }), 'rules[0].if.any[0].side'],
        [
            'unknown sound',
            withRule({ do: [{ sound: 'nope' }] }),
            'rules[0].do[0].sound: unknown sound "nope"',
        ],
        [
            'unknown anim',
            withRule({ do: [{ anim: 'nope' }] }),
            'rules[0].do[0].anim: unknown animation "nope"',
        ],
        ['glide is not an effect', withRule({ do: [{ anim: 'glide' }] }), 'rules[0].do[0].anim'],
        ['target', withRule({ do: [{ anim: 'beat', target: 'moon' }] }), 'rules[0].do[0].target'],
        ['bubble', withRule({ do: [{ bubble: 'hi' }] }), 'rules[0].do[0].bubble'],
        ['haptic', withRule({ do: [{ haptic: 'boom' }] }), 'rules[0].do[0].haptic'],
        [
            'layout',
            withRule({ do: [{ layout: 'spiral', cards: ['KING_OF_SPADES'] }] }),
            'rules[0].do[0].layout',
        ],
        ['layout cards', withRule({ do: [{ layout: 'pin_left', cards: [] }] }), 'rules[0].do[0].cards'],
        [
            'stick_together needs two',
            withRule({ do: [{ layout: 'stick_together', cards: ['KING_OF_SPADES'] }] }),
            'rules[0].do[0].cards',
        ],
        [
            'two effects in one',
            withRule({ do: [{ sound: 'slide', haptic: 'tap' }] }),
            'rules[0].do[0]: expected exactly one',
        ],
        ['effect not an object', withRule({ do: ['slide'] }), 'rules[0].do[0]: expected an object'],
    ])('rejects %s', (_, json, message) => {
        expect(errorsOf(json).join('\n')).toContain(message);
    });

    describe('say effect', () => {
        const say = (effect: Record<string, unknown>) => withRule({ do: [effect] });

        it('accepts a line with optional rate and pitch', () => {
            expect(errorsOf(say({ say: { uk: 'Мінус гроші' } }))).toEqual([]);
            expect(errorsOf(say({ say: { uk: 'Йоу' }, rate: 0.5, pitch: 2 }))).toEqual([]);
        });

        it.each([
            ['empty text', { say: { uk: '' } }, 'rules[0].do[0].say: expected { "uk": "..." }'],
            ['missing text', { say: 'Йоу' }, 'rules[0].do[0].say: expected { "uk": "..." }'],
            [
                'text over 120 chars',
                { say: { uk: 'а'.repeat(121) } },
                'rules[0].do[0].say: expected at most 120',
            ],
            [
                'rate above 2',
                { say: { uk: 'Йоу' }, rate: 3 },
                'rules[0].do[0].rate: expected a number in 0.5..2',
            ],
            ['rate below 0.5', { say: { uk: 'Йоу' }, rate: 0.1 }, 'rules[0].do[0].rate'],
            [
                'pitch above 2',
                { say: { uk: 'Йоу' }, pitch: 2.5 },
                'rules[0].do[0].pitch: expected a number in 0..2',
            ],
            ['pitch not a number', { say: { uk: 'Йоу' }, pitch: 'high' }, 'rules[0].do[0].pitch'],
        ])('rejects %s', (_, effect, message) => {
            expect(errorsOf(say(effect)).join('\n')).toContain(message);
        });

        it('reports unknown keys beside say as errors when strict and as warnings otherwise', () => {
            const json = say({ say: { uk: 'Йоу' }, volume: 1 });
            expect(validatePack(json, { strict: true }).errors).toEqual([
                'rules[0].do[0].volume: unknown key',
            ]);
            expect(validatePack(json, { strict: false })).toEqual({
                errors: [],
                warnings: ['rules[0].do[0].volume: unknown key'],
            });
        });
    });

    it('accepts the felt as an animation target', () => {
        expect(errorsOf(withRule({ do: [{ anim: 'shake', target: 'felt' }] }))).toEqual([]);
        expect(TARGETS).toContain('felt');
        expect(EFFECTS).toContain('say');
    });

    it('requires all 36 faces', () => {
        const cards = { ...(deck()['cards'] as Record<string, unknown>) };
        delete cards['ACE_OF_SPADES'];
        expect(errorsOf(deck({ cards }))).toContain('cards: missing ACE_OF_SPADES');
    });

    it('checks that every referenced file exists when asked', () => {
        const json = deck({ back: 'cards/back.svg', sounds: { boom: 'sounds/boom.wav' }, styles: 'fx.css' });
        const present = new Set(CARD_IDS.map((id) => `cards/${id}.svg`));
        const { errors } = validatePack(json, { strict: true, exists: (path) => present.has(path) });
        expect(errors).toEqual([
            'back: file not found: cards/back.svg',
            'styles: file not found: fx.css',
            'sounds.boom: file not found: sounds/boom.wav',
        ]);
    });

    it('reports unknown vocabulary as errors when strict and as warnings otherwise', () => {
        const json = deck({
            future: true,
            rules: [
                { id: 'a', on: 'card_exploded', do: [{ sound: 'slide' }] },
                { id: 'b', on: 'card_played', if: { mood: 'happy' }, do: [{ confetti: true }] },
            ],
        });
        const expected = [
            'future: unknown key',
            'rules[0].on: unknown trigger "card_exploded"',
            'rules[1].if.mood: unknown condition',
            'rules[1].do[0]: unknown effect',
        ];

        expect(validatePack(json, { strict: true })).toEqual({ errors: expected, warnings: [] });
        expect(validatePack(json, { strict: false })).toEqual({ errors: [], warnings: expected });
    });
});

describe('packs.schema.json', () => {
    const schema = JSON.parse(readFileSync(resolve('packs.schema.json'), 'utf8')) as {
        $defs: Record<string, { enum?: string[]; properties?: Record<string, unknown> }>;
    };
    const defs = schema.$defs;

    it('lists the same vocabulary as the validator', () => {
        expect(defs['trigger']?.enum).toEqual([...TRIGGERS]);
        expect(defs['target']?.enum).toEqual([...TARGETS]);
        expect(defs['haptic']?.enum).toEqual([...HAPTICS]);
        expect(defs['layoutKind']?.enum).toEqual([...LAYOUTS]);
        expect(defs['cardId']?.enum).toEqual([...CARD_IDS]);
        expect(Object.keys(defs['condition']?.properties ?? {})).toEqual([...CONDITIONS]);
        expect(EFFECTS.every((effect) => defs[`${effect}Effect`])).toBe(true);
    });
});

describe('packIndexEntry', () => {
    it('names the pack and previews three faces by path from the app base', () => {
        expect(packIndexEntry(deck() as never)).toEqual({
            id: 'test-deck',
            name: { uk: 'Тестова колода' },
            preview: [
                'packs/test-deck/cards/ACE_OF_HEARTS.svg',
                'packs/test-deck/cards/KING_OF_SPADES.svg',
                'packs/test-deck/cards/QUEEN_OF_DIAMONDS.svg',
            ],
        });
    });

    it("offers the first of the pack's sounds as its demo, and none for a silent pack", () => {
        const sounds = { fanfare: 'sounds/fanfare.wav', boo: 'sounds/boo.wav' };
        expect(packIndexEntry(deck({ sounds }) as never).demoSound).toBe(
            'packs/test-deck/sounds/fanfare.wav',
        );
        expect(packIndexEntry(deck() as never).demoSound).toBeUndefined();
    });

    it('resolves faces that climb out of the pack folder', () => {
        const cards = { ACE_OF_HEARTS: { image: '../../cards/classic/ace_of_hearts.svg' } };
        expect(packIndexEntry(deck({ cards }) as never).preview).toEqual(['cards/classic/ace_of_hearts.svg']);
    });
});
