import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_IDS, EFFECTS, packIndexEntry, validatePack } from './schema';
import type { Effect, PackManifest } from './types';

// Vitest runs from client/; the shipped packs are the static files the app serves.
const publicDir = resolve('public');
const packsDir = join(publicDir, 'packs');
const read = (id: string) =>
    JSON.parse(readFileSync(join(packsDir, id, 'pack.json'), 'utf8')) as PackManifest;
const shipped = readdirSync(packsDir).filter((name) => statSync(join(packsDir, name)).isDirectory());

describe('packs/index.json', () => {
    it('lists every shipped pack, classic first, with previews that exist', () => {
        const index = JSON.parse(readFileSync(join(packsDir, 'index.json'), 'utf8')) as unknown[];
        const ids = ['classic', ...shipped.filter((id) => id !== 'classic').sort()];

        expect(index).toEqual(ids.map((id) => packIndexEntry(read(id))));
        for (const entry of index as { preview: string[] }[]) {
            expect(entry.preview).toHaveLength(3);
            entry.preview.forEach((path) => expect(existsSync(join(publicDir, path)), path).toBe(true));
        }
    });
});

describe('shipped packs', () => {
    it.each(shipped)('%s validates strictly with every file present', (id) => {
        const exists = (path: string) => existsSync(resolve(packsDir, id, path));
        expect(validatePack(read(id), { strict: true, exists })).toEqual({ errors: [], warnings: [] });
        expect(read(id).id).toBe(id);
    });

    it.each(shipped.filter((id) => id !== 'classic'))(
        '%s has a back, a demo sound and lines that fit a bubble',
        (id) => {
            const pack = read(id);
            expect(pack.back).toBeDefined();
            expect(packIndexEntry(pack).demoSound).toBeDefined();
            for (const rule of pack.rules ?? []) {
                for (const effect of rule.do) {
                    const line = lineOf(effect);
                    if (line !== undefined) {
                        expect(line.length, `${id} ${rule.id}`).toBeLessThanOrEqual(120);
                    }
                }
            }
        },
    );

    it.each(shipped.filter((id) => read(id).styles !== undefined))(
        '%s defines the class of every css animation in its stylesheet',
        (id) => {
            const pack = read(id);
            const css = readFileSync(resolve(packsDir, id, pack.styles ?? ''), 'utf8');
            for (const anim of Object.values(pack.animations ?? {})) {
                expect(css).toContain(`.${anim.className}`);
            }
        },
    );

    it('ships classic as today’s SVGs with no rules', () => {
        const classic = read('classic');
        expect(classic.rules ?? []).toEqual([]);
        expect(resolve(packsDir, 'classic', classic.back ?? '')).toBe(
            join(publicDir, 'cards/classic/back.svg'),
        );
        for (const id of CARD_IDS) {
            const [rank = '', , suit = ''] = id.split('_');
            expect(resolve(packsDir, 'classic', classic.cards[id]?.image ?? '')).toBe(
                join(publicDir, `cards/classic/${rank.toLowerCase()}_of_${suit.toLowerCase()}.svg`),
            );
        }
    });

    describe('memes-demo', () => {
        const demo = () => read('memes-demo');

        it('titles and tags every face', () => {
            for (const id of CARD_IDS) {
                expect(demo().cards[id]?.title?.uk, id).toBeTruthy();
                expect(demo().cards[id]?.tags?.length, id).toBeGreaterThan(0);
            }
            expect(demo().back).toBeDefined();
        });

        it('ships two sounds and four rules that use every effect type', () => {
            const pack = demo();
            expect(Object.keys(pack.sounds ?? {})).toHaveLength(2);
            const rules = pack.rules ?? [];
            expect(rules).toHaveLength(4);
            const kinds = new Set(rules.flatMap((rule) => rule.do.flatMap((effect) => Object.keys(effect))));
            for (const kind of EFFECTS) {
                expect(kinds.has(kind), kind).toBe(true);
            }
        });

        it('keeps the king and jack of spades together while both are held', () => {
            const sticky = (demo().rules ?? []).find((rule) => rule.on === 'hand_changed');
            expect(sticky?.if?.handHas).toEqual(['KING_OF_SPADES', 'JACK_OF_SPADES']);
            expect(sticky?.do).toContainEqual({
                layout: 'stick_together',
                cards: ['KING_OF_SPADES', 'JACK_OF_SPADES'],
            });
        });
    });

    describe.each(SATIRE)('%s (satire)', (id) => {
        const pack = () => read(id);
        const roster = async () =>
            ((await import(`../../scripts/rosters/${id}.mjs`)) as { default: Roster }).default;

        it('is named as satire', () => {
            expect(pack().name.uk.endsWith(' (сатира)')).toBe(true);
            expect(pack().id).toBe(id);
        });

        it('has one persona per rank, each on every suit with its own tag', async () => {
            const { personas } = await roster();
            expect(personas.map((persona) => persona.rank).sort()).toEqual([...RANKS].sort());
            for (const persona of personas) {
                for (const suit of SUITS) {
                    const card = pack().cards[`${persona.rank}_OF_${suit}`];
                    expect(card?.title?.uk).toBe(persona.name);
                    expect(card?.tags).toContain(persona.tag);
                }
            }
        });

        it('carries 36 distinct quotes, each printed on its own face', async () => {
            const { personas } = await roster();
            const quotes = personas.flatMap((persona) => SUITS.map((suit) => persona.quotes[suit]));
            expect(quotes).toHaveLength(36);
            expect(new Set(quotes).size).toBe(36);
            for (const persona of personas) {
                for (const suit of SUITS) {
                    const svg = face(id, `${persona.rank}_OF_${suit}`);
                    for (const word of persona.quotes[suit].split(' ')) {
                        expect(svg, `${persona.rank} ${suit}: ${word}`).toContain(escapeXml(word));
                    }
                    // A long name wraps onto two lines, so it is checked word by word like the quote.
                    for (const word of persona.name.split(' ')) {
                        expect(svg, `${persona.rank} ${suit}: ${word}`).toContain(escapeXml(word));
                    }
                }
            }
        });

        it('draws every face from paths and text alone, marked as satire, with corner indices', () => {
            for (const cardId of CARD_IDS) {
                const svg = face(id, cardId);
                // Nothing fetched from anywhere: no bitmaps, no links; url(#…) only points at the card's own defs.
                expect(svg).not.toMatch(/<image|href=|url\((?!#)|data:/);
                expect(svg).toContain('САТИРА');
                const [rank = '', , suit = ''] = cardId.split('_');
                expect(svg).toContain(`>${LABELS[rank]}<`);
                expect(svg).toContain(`>${GLYPHS[suit]}<`);
            }
            expect(face(id, 'back')).not.toMatch(/<image|href=|url\(http|data:/);
        });

        it('keeps the inseparable pair together on every suit and talks', () => {
            const rules = pack().rules ?? [];
            expect(rules.length).toBeGreaterThanOrEqual(10);
            const sticky = rules.filter((rule) => rule.id.startsWith(STICKY[id]));
            expect(sticky).toHaveLength(4);
            const kinds = new Set(rules.flatMap((rule) => rule.do.flatMap((effect) => Object.keys(effect))));
            expect(kinds.has('say')).toBe(true);
            expect(rules.some((rule) => rule.if?.outcome === 'WON')).toBe(true);
            expect(rules.some((rule) => rule.if?.outcome === 'LOST')).toBe(true);
        });
    });
});

/** The satire decks and the prefix of their four per-suit stick-together rules. */
const STICKY = { 'sluhy-narodu': 'inseparable-', blogery: 'fund-duo-' } as const;
const SATIRE = Object.keys(STICKY) as (keyof typeof STICKY)[];
const RANKS = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'] as const;
const SUITS = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as const;
const LABELS: Record<string, string> = {
    SIX: '6',
    SEVEN: '7',
    EIGHT: '8',
    NINE: '9',
    TEN: '10',
    JACK: 'J',
    QUEEN: 'Q',
    KING: 'K',
    ACE: 'A',
};
const GLYPHS: Record<string, string> = { CLUBS: '♣', DIAMONDS: '♦', HEARTS: '♥', SPADES: '♠' };

interface Roster {
    personas: {
        rank: (typeof RANKS)[number];
        name: string;
        tag: string;
        quotes: Record<(typeof SUITS)[number], string>;
    }[];
}

const face = (id: string, cardId: string) =>
    readFileSync(join(packsDir, id, 'cards', `${cardId}.svg`), 'utf8');
const escapeXml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lineOf = (effect: Effect): string | undefined =>
    'say' in effect ? effect.say.uk : 'bubble' in effect ? effect.bubble.uk : undefined;
