import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_IDS, EFFECTS, packIndexEntry, validatePack } from './schema';
import type { PackManifest } from './types';

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

        it('defines the class of every css animation in its stylesheet', () => {
            const pack = demo();
            const css = readFileSync(resolve(packsDir, 'memes-demo', pack.styles ?? ''), 'utf8');
            for (const anim of Object.values(pack.animations ?? {})) {
                expect(css).toContain(`.${anim.className}`);
            }
        });
    });
});
