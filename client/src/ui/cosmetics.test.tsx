import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { BackSwatch, EMOTE_PHRASES, emoteGlyph, emotePhrase, FrameSwatch, TableSwatch } from './cosmetics';

// Vitest runs from client/.
const css = readFileSync(resolve('src/ui/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every ref the shop seeds (changesets 010 and 013); each needs a drawn style or it renders as nothing. */
const BACKS = [
    'classic',
    'trident',
    'sunflower',
    'bayraktar',
    'palianytsia',
    'ukrzaliznytsia',
    'bavovna',
    'chornobaivka',
];
const TABLES = ['green', 'night', 'borscht', 'blackout', 'bukovel', 'kabmin', 'metro'];
const FRAMES = ['gold', 'blue-yellow', 'tryzub-gold', 'vyshyvanka', 'kozak'];
const PHRASES = ['minus-money', 'chumachecha', 'ty-sho', 'palianytsia', 'bavovna', 'dobroho-vechora'];

const hasRule = (selector: string) =>
    new RegExp(`(^|[\\s,])${selector.replace(/[.-]/g, '\\$&')}\\s*[,{]`, 'm').test(css);

describe('cosmetics', () => {
    it('draws every seeded card back, table and frame in CSS alone', () => {
        expect(BACKS.filter((ref) => !hasRule(`.back-${ref}`))).toEqual([]);
        expect(TABLES.filter((ref) => !hasRule(`.felt.table-${ref}`))).toEqual([]);
        expect(FRAMES.filter((ref) => !hasRule(`.frame-${ref}`))).toEqual([]);
        // The content security policy allows no remote images: a style may embed an SVG, never fetch one.
        const fetched = [...css.matchAll(/url\(([^)]*)\)/g)]
            .map((match) => (match[1] ?? '').trim().replace(/^["']/, ''))
            .filter((target) => !target.startsWith('data:'));
        expect(fetched).toEqual([]);
    });

    it('renders a swatch per ref, with the ref in the class and the data attribute', () => {
        const { container } = render(
            <>
                <BackSwatch back="bavovna" />
                <TableSwatch table="kabmin" />
                <FrameSwatch frame="kozak" />
            </>,
        );
        expect(container.querySelector('.back-bavovna[data-back="bavovna"]')).toBeTruthy();
        expect(container.querySelector('.table-kabmin[data-table="kabmin"]')).toBeTruthy();
        expect(container.querySelector('.frame-kozak[data-frame="kozak"]')).toBeTruthy();
    });

    it('gives every phrase emote a glyph and its text', () => {
        for (const ref of PHRASES) {
            const phrase = EMOTE_PHRASES[ref];
            expect(phrase?.glyph, ref).toBeTruthy();
            expect(phrase?.text, ref).toBeTruthy();
            expect(emoteGlyph(ref)).toBe(phrase?.glyph);
            expect(emotePhrase(ref)).toBe(phrase?.text);
        }
        expect(emotePhrase('ty-sho')).toBe('Ти шо, Кличко?');
        expect(emotePhrase('like')).toBeUndefined();
        expect(emoteGlyph('like')).toBe('👍');
    });
});
