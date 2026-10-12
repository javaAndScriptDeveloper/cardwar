import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_IDS, validatePack } from './schema';
import type { PackManifest } from './types';

// Vitest runs from client/; the shipped packs are the static files the app serves.
const publicDir = resolve('public');
const packsDir = join(publicDir, 'packs');
const read = (id: string) =>
    JSON.parse(readFileSync(join(packsDir, id, 'pack.json'), 'utf8')) as PackManifest;
const shipped = readdirSync(packsDir).filter((name) => statSync(join(packsDir, name)).isDirectory());

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
});
