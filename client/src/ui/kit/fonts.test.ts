import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', '..', '..', 'public');

/** A face that points at a missing file falls back silently to the system font, so the check lives here. */
describe('fonts.css', () => {
    const css = readFileSync(join(here, 'fonts.css'), 'utf8');
    const urls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((match) => match[1] ?? '');

    it('declares both brand families', () => {
        expect(css).toContain("font-family: 'Unbounded'");
        expect(css).toContain("font-family: 'Manrope'");
    });

    it('references only font files that ship in public/fonts', () => {
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            expect(url.startsWith('/app/fonts/'), url).toBe(true);
            expect(existsSync(join(publicDir, url.replace('/app/', ''))), url).toBe(true);
        }
    });
});
