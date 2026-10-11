// Generates the classic deck: 36 faces and one back, as plain SVG with no external fonts or images.
// Run with `npm run gen:cards`; the output is committed so the build never depends on this script.
// File names are `<rank>_of_<suit>.svg`, exactly the catalog seed's image_ref (classic/six_of_clubs.svg, ...).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/cards/classic/', import.meta.url));
const W = 240;
const H = 336;

const RANKS = [
    ['SIX', '6', 6],
    ['SEVEN', '7', 7],
    ['EIGHT', '8', 8],
    ['NINE', '9', 9],
    ['TEN', '10', 10],
    ['JACK', 'J', 0],
    ['QUEEN', 'Q', 0],
    ['KING', 'K', 0],
    ['ACE', 'A', 1],
];

const RED = '#c62828';
const BLACK = '#1d1d24';

// Each suit drawn in a 100x100 box, centred on (50, 50).
const SUITS = {
    CLUBS: {
        colour: BLACK,
        shape:
            '<circle cx="50" cy="27" r="19"/><circle cx="27" cy="57" r="19"/><circle cx="73" cy="57" r="19"/>' +
            '<circle cx="50" cy="50" r="12"/><path d="M45 55 C45 74 39 86 30 96 L70 96 C61 86 55 74 55 55 Z"/>',
    },
    DIAMONDS: { colour: RED, shape: '<path d="M50 3 L87 50 L50 97 L13 50 Z"/>' },
    HEARTS: {
        colour: RED,
        shape: '<path d="M50 92 C22 70 4 52 4 31 C4 15 16 5 30 5 C40 5 46 11 50 19 C54 11 60 5 70 5 C84 5 96 15 96 31 C96 52 78 70 50 92 Z"/>',
    },
    SPADES: {
        colour: BLACK,
        shape: '<path d="M50 3 C68 25 96 40 96 61 C96 75 86 83 74 83 C66 83 59 79 55 72 C56 83 61 90 69 96 L31 96 C39 90 44 83 45 72 C41 79 34 83 26 83 C14 83 4 75 4 61 C4 40 32 25 50 3 Z"/>',
    },
};

// Pip centres for the numbered cards; pips below the middle are drawn upside down, as on a real deck.
const L = 78;
const C = 120;
const R = 162;
const PIPS = {
    6: [
        [L, 92],
        [R, 92],
        [L, 168],
        [R, 168],
        [L, 244],
        [R, 244],
    ],
    7: [
        [L, 92],
        [R, 92],
        [C, 130],
        [L, 168],
        [R, 168],
        [L, 244],
        [R, 244],
    ],
    8: [
        [L, 92],
        [R, 92],
        [C, 130],
        [L, 168],
        [R, 168],
        [C, 206],
        [L, 244],
        [R, 244],
    ],
    9: [
        [L, 92],
        [R, 92],
        [L, 143],
        [R, 143],
        [C, 168],
        [L, 193],
        [R, 193],
        [L, 244],
        [R, 244],
    ],
    10: [
        [L, 92],
        [R, 92],
        [C, 118],
        [L, 143],
        [R, 143],
        [L, 193],
        [R, 193],
        [C, 218],
        [L, 244],
        [R, 244],
    ],
};

const glyph = (x, y, size, flip = false) =>
    `<use href="#suit" x="0" y="0" width="100" height="100" transform="translate(${x - size / 2} ${y - size / 2}) ${
        flip ? `rotate(180 ${size / 2} ${size / 2})` : ''
    } scale(${size / 100})"/>`;

const frame = (fill) =>
    `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="${fill}" stroke="#b9bcc6" stroke-width="3"/>`;

function corner(label, colour) {
    const size = label.length > 1 ? 40 : 46;
    return (
        `<g fill="${colour}">` +
        `<text x="28" y="54" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${size}">${label}</text>` +
        glyph(28, 82, 30) +
        `</g>`
    );
}

function centre(rank, label, pips) {
    if (pips >= 6) {
        return PIPS[pips].map(([x, y]) => glyph(x, y, 44, y > H / 2)).join('');
    }
    if (pips === 1) {
        return glyph(W / 2, H / 2, 120);
    }
    // Court cards: a framed panel with the letter and a large suit, no figure art (legible at phone size).
    return (
        `<rect x="54" y="64" width="${W - 108}" height="${H - 128}" rx="10" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="3"/>` +
        `<text x="${W / 2}" y="150" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="76">${label}</text>` +
        glyph(W / 2, 210, 70)
    );
}

function face(rank, label, pips, suit) {
    const { colour, shape } = SUITS[suit];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><symbol id="suit" viewBox="0 0 100 100" overflow="visible">${shape}</symbol></defs>
${frame('#ffffff')}
<g fill="${colour}" color="${colour}">${centre(rank, label, pips)}</g>
${corner(label, colour)}
<g transform="rotate(180 ${W / 2} ${H / 2})">${corner(label, colour)}</g>
</svg>
`;
}

function back() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<pattern id="lattice" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="16" height="16" fill="#1e4f9c"/><path d="M0 8 H16 M8 0 V16" stroke="#3f74c9" stroke-width="3"/>
</pattern>
</defs>
${frame('#ffffff')}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="url(#lattice)"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="none" stroke="#163c78" stroke-width="4"/>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
let count = 0;
for (const suit of Object.keys(SUITS)) {
    for (const [rank, label, pips] of RANKS) {
        writeFileSync(
            `${OUT}${rank.toLowerCase()}_of_${suit.toLowerCase()}.svg`,
            face(rank, label, pips, suit),
        );
        count++;
    }
}
writeFileSync(`${OUT}back.svg`, back());
console.log(`Wrote ${count} faces and a back to ${OUT}`);
