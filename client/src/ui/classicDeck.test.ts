import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'public', 'cards', 'classic');
const RANKS = ['six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

/**
 * The classic deck is generated (scripts/gen-cards.mjs) and committed; these checks keep the generated set
 * complete and keep the v2 drawing: every face carries its rank in both hands, court cards carry a figure, and
 * the back is the brand lattice. File names are the catalog seed's image_ref and must not move.
 */
describe('classic deck', () => {
    it('ships every rank of every suit and a back', () => {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                expect(existsSync(join(dir, `${rank}_of_${suit}.svg`)), `${rank}_of_${suit}`).toBe(true);
            }
        }
        expect(existsSync(join(dir, 'back.svg'))).toBe(true);
    });

    it('draws court cards as mirrored figures, not a letter in a box', () => {
        for (const rank of ['jack', 'queen', 'king']) {
            const svg = readFileSync(join(dir, `${rank}_of_hearts.svg`), 'utf8');
            expect(svg, rank).toContain('class="court"');
            expect(svg, rank).toContain('class="figure"');
        }
    });

    it('marks the brand on the back', () => {
        const svg = readFileSync(join(dir, 'back.svg'), 'utf8');
        expect(svg).toContain('id="medallion"');
    });
});
