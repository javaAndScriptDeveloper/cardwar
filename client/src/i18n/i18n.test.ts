import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardLabel, plural, t } from './index';
import uk from './uk.json';

/** Dotted keys of every string leaf; arrays (plural forms) are not keys. */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) => {
        if (typeof value === 'string') {
            return [`${prefix}${key}`];
        }
        if (Array.isArray(value)) {
            return [];
        }
        return flatten(value as Record<string, unknown>, `${prefix}${key}.`);
    });
}

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            return sources(path);
        }
        return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
}

describe('message catalog', () => {
    const defined = new Set(flatten(uk as Record<string, unknown>));
    const used = new Set<string>();
    for (const file of sources(join(__dirname, '..'))) {
        for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
            used.add(match[1] ?? '');
        }
    }
    // Keys built at runtime from a code are declared here so the scan can see them.
    const catalog = uk as { reason: Record<string, string> };
    const dynamic = [
        ...['your-attack', 'throw-in', 'defending', 'defend', 'waiting-attack', 'waiting', 'over'].map(
            (state) => `duel.status.${state}`,
        ),
        ...Object.keys(catalog.reason).map((reason) => `reason.${reason}`),
        ...['WON', 'LOST', 'DRAW'].flatMap((r) => [`duel.result.${r}`, `duel.explain.${r}`]),
        ...['six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'].map(
            (r) => `card.rank.${r}`,
        ),
        ...['clubs', 'diamonds', 'hearts', 'spades'].map((s) => `card.suit.${s}`),
        ...['play', 'friends', 'shop', 'profile'].map((n) => `nav.${n}`),
        ...['decks', 'backs', 'tables', 'frames', 'emotes'].map((id) => `shop.tabs.${id}`),
        ...['sound', 'music', 'haptics', 'swipe', 'reducedMotion'].map((key) => `settings.${key}`),
    ];
    dynamic.forEach((key) => used.add(key));

    it('defines every key the code uses', () => {
        expect([...used].filter((key) => !defined.has(key))).toEqual([]);
    });

    it('uses every key it defines', () => {
        expect([...defined].filter((key) => !used.has(key))).toEqual([]);
    });
});

describe('t', () => {
    it('substitutes params', () => {
        expect(t('duel.status.defending', { name: 'Оля' })).toContain('Оля');
    });

    it('returns the key when missing', () => {
        expect(t('nope.missing')).toBe('nope.missing');
    });
});

describe('cardLabel', () => {
    it('reads Ukrainian', () => {
        expect(cardLabel({ rank: 'SEVEN', suit: 'SPADES' })).toBe('Сімка пік');
    });
});

describe('plural', () => {
    it('follows Ukrainian rules', () => {
        const forms: [string, string, string] = ['карта', 'карти', 'карт'];
        expect(plural(1, forms)).toBe('карта');
        expect(plural(3, forms)).toBe('карти');
        expect(plural(5, forms)).toBe('карт');
        expect(plural(21, forms)).toBe('карта');
        expect(plural(12, forms)).toBe('карт');
    });
});
