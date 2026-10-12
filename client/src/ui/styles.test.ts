import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from client/.
const css = ['src/ui/styles.css', 'src/ui/kit/tokens.css']
    .map((path) => readFileSync(resolve(path), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule's selector list, split into its selectors. */
function selectorLists(): string[][] {
    return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((match) =>
        (match[1] ?? '')
            .split(',')
            .map((selector) => selector.trim())
            .filter(Boolean),
    );
}

describe('styles', () => {
    it('gives the disabled look only to disabled controls', () => {
        // A selector grouped with `:disabled` shares its faded look; that once made every large button read as off.
        const offenders = selectorLists()
            .filter((list) =>
                list.some((selector) => selector.includes(':disabled') && !selector.includes(':not(')),
            )
            .flatMap((list) => list.filter((selector) => !selector.includes(':disabled')));

        expect(offenders).toEqual([]);
    });
});
