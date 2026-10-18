import { describe, expect, it } from 'vitest';
import { face } from './poster.mjs';

const persona = {
    name: 'Сірий кардинал',
    role: 'офіс',
    colour: '#37474f',
    tag: 'yermak',
    look: { hair: 'short', clothes: 'suit' },
};
const quote = 'Ниточки тягну я.';
// A 1×1 JPEG is enough: the face only embeds the bytes it is given.
const portrait =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z';

describe('face', () => {
    it('draws the vector avatar when the persona has no portrait', () => {
        const svg = face({ label: 'K', suit: 'SPADES', persona, quote });
        expect(svg).toContain('class="avatar"');
        expect(svg).not.toContain('<image');
    });

    it('embeds a portrait in place of the avatar and keeps the name, quote, stamp and corners', () => {
        const svg = face({ label: 'K', suit: 'SPADES', persona, quote, portrait });
        expect(svg).toContain(`<image href="${portrait}"`);
        expect(svg).not.toContain('class="avatar"');
        // A long nickname wraps onto two lines, so it is checked word by word.
        expect(svg).toContain('Сірий');
        expect(svg).toContain('кардинал');
        expect(svg).toContain('Ниточки тягну я.');
        expect(svg).toContain('class="stamp"');
        expect(svg).toContain('>K<');
        expect(svg).toContain('>♠<');
    });

    it('refuses a portrait that is not an embedded jpeg', () => {
        expect(() =>
            face({ label: 'K', suit: 'SPADES', persona, quote, portrait: 'https://x/y.jpg' }),
        ).toThrow(/portrait/);
    });
});
