import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const packs = join(here, '..', '..', 'public', 'packs');

/**
 * The satire decks are generated from their rosters (scripts/gen-pack-satire.mjs) and committed. v2 poster faces
 * carry a vector avatar and the tilted satire stamp; a roster persona without a `look` would silently fall back to
 * a bare poster, so the generated output is what is checked.
 */
describe.each(['sluhy-narodu', 'blogery'])('satire pack %s', (id) => {
    const faces = readdirSync(join(packs, id, 'cards')).filter((name) => name !== 'back.svg');

    it('has 36 poster faces, each with an avatar and the satire stamp', () => {
        expect(faces).toHaveLength(36);
        for (const name of faces) {
            const svg = readFileSync(join(packs, id, 'cards', name), 'utf8');
            expect(svg, name).toContain('class="avatar"');
            expect(svg, name).toContain('class="stamp"');
        }
    });
});
