// Generates the classic deck: 36 faces and one back, as plain SVG with no external fonts or images.
// Run with `npm run gen:cards`; the output is committed so the build never depends on this script.
// File names are `<rank>_of_<suit>.svg`, exactly the catalog seed's image_ref (classic/six_of_clubs.svg, ...).
//
// v2 look: cream paper with a double border, bold serif indices, court cards as flat geometric figures mirrored
// top and bottom (as on a real deck), aces with an ornament ring, and a back with the brand medallion on an azure
// lattice. Everything is geometry so a card stays crisp at 38 px in a ten-card hand and at full size in the shop.
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

const RED = '#c4272e';
const BLACK = '#1b1d2a';
const PAPER = '#fbf7ee';
const PAPER_EDGE = '#cdbf9c';
const GOLD = '#c9a24a';
const SKIN = '#f2d3b1';
const SERIF = 'font-family="Georgia, \'Times New Roman\', serif" font-weight="700"';

// Each suit drawn in a 100x100 box, centred on (50, 50).
const SUITS = {
    CLUBS: {
        colour: BLACK,
        shape:
            '<circle cx="50" cy="26" r="20"/><circle cx="26" cy="58" r="20"/><circle cx="74" cy="58" r="20"/>' +
            '<circle cx="50" cy="52" r="13"/><path d="M45 56 C45 75 39 87 29 97 L71 97 C61 87 55 75 55 56 Z"/>',
    },
    DIAMONDS: {
        colour: RED,
        shape: '<path d="M50 2 C62 24 76 38 90 50 C76 62 62 76 50 98 C38 76 24 62 10 50 C24 38 38 24 50 2 Z"/>',
    },
    HEARTS: {
        colour: RED,
        shape: '<path d="M50 94 C24 72 4 54 4 31 C4 15 16 4 30 4 C40 4 47 10 50 19 C53 10 60 4 70 4 C84 4 96 15 96 31 C96 54 76 72 50 94 Z"/>',
    },
    SPADES: {
        colour: BLACK,
        shape: '<path d="M50 3 C68 25 96 40 96 61 C96 75 86 83 74 83 C66 83 59 79 55 72 C56 83 61 90 70 97 L30 97 C39 90 44 83 45 72 C41 79 34 83 26 83 C14 83 4 75 4 61 C4 40 32 25 50 3 Z"/>',
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

/** Cream paper with a thin edge and a hairline inner border. */
const paper = () =>
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="18" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-width="3"/>` +
    `<rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="12" fill="none" stroke="${GOLD}" stroke-opacity="0.45" stroke-width="1"/>`;

function corner(label, colour) {
    const size = label.length > 1 ? 40 : 48;
    return (
        `<g fill="${colour}">` +
        `<text x="29" y="56" text-anchor="middle" ${SERIF} font-size="${size}">${label}</text>` +
        glyph(29, 84, 30) +
        `</g>`
    );
}

/* ---- Court figures ------------------------------------------------------------------------------------------ */

const crown = (y, colour) =>
    `<path d="M92 ${y} L100 ${y - 22} L111 ${y - 6} L120 ${y - 28} L129 ${y - 6} L140 ${y - 22} L148 ${y} Z" fill="${GOLD}" stroke="#8a6a1f" stroke-width="2"/>` +
    `<circle cx="100" cy="${y - 23}" r="3.5" fill="${colour}"/><circle cx="120" cy="${y - 29}" r="4" fill="${colour}"/><circle cx="140" cy="${y - 23}" r="3.5" fill="${colour}"/>`;

const tiara = (y, colour) =>
    `<path d="M96 ${y} Q120 ${y - 30} 144 ${y} Z" fill="${GOLD}" stroke="#8a6a1f" stroke-width="2"/>` +
    `<circle cx="120" cy="${y - 12}" r="4" fill="${colour}"/>`;

const cap = (y, colour) =>
    `<path d="M94 ${y + 4} Q96 ${y - 24} 126 ${y - 22} L150 ${y - 34} L140 ${y - 10} Q148 ${y - 2} 146 ${y + 4} Z" fill="${colour}"/>` +
    `<path d="M126 ${y - 22} L150 ${y - 34}" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`;

/**
 * The upper half of a court figure (head and shoulders), drawn once and mirrored for the lower half by the caller.
 * J, Q and K differ in headgear, hair and what they hold; the shoulders carry the suit colour and a gold band.
 */
function figure(rank, colour, flip) {
    const headY = 112;
    const hair =
        rank === 'QUEEN'
            ? // Two long locks falling past the shoulders, behind the head.
              `<path d="M100 ${headY - 6} Q90 ${headY + 20} 96 ${headY + 50} L108 ${headY + 46} Q104 ${headY + 20} 108 ${headY - 2} Z" fill="#4a2c17"/>` +
              `<path d="M140 ${headY - 6} Q150 ${headY + 20} 144 ${headY + 50} L132 ${headY + 46} Q136 ${headY + 20} 132 ${headY - 2} Z" fill="#4a2c17"/>`
            : rank === 'KING'
              ? `<path d="M104 ${headY + 10} Q120 ${headY + 46} 136 ${headY + 10} Z" fill="#4a2c17"/>`
              : '';
    const regalia =
        rank === 'KING'
            ? crown(headY - 16, colour)
            : rank === 'QUEEN'
              ? tiara(headY - 14, colour)
              : cap(headY - 14, colour);
    const prop =
        rank === 'KING'
            ? // A sceptre across the shoulder, as on the classic king of hearts.
              `<path d="M72 ${headY + 70} L104 ${headY + 36}" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>` +
              `<circle cx="104" cy="${headY + 36}" r="6" fill="${GOLD}"/>`
            : rank === 'QUEEN'
              ? `<path d="M152 ${headY + 66} L148 ${headY + 44}" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>` +
                `<circle cx="147" cy="${headY + 40}" r="5" fill="${colour}"/>`
              : `<path d="M160 ${headY + 70} L152 ${headY + 40}" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`;
    return (
        `<g class="figure" transform="${flip ? `rotate(180 ${W / 2} ${H / 2})` : ''}">` +
        // Shoulders in the suit colour with a gold band, clipped by the panel's middle so the halves meet.
        `<path d="M58 168 L70 ${headY + 46} Q120 ${headY + 24} 170 ${headY + 46} L182 168 Z" fill="${colour}"/>` +
        `<path d="M66 ${headY + 56} Q120 ${headY + 36} 174 ${headY + 56}" stroke="${GOLD}" stroke-width="5" fill="none"/>` +
        glyph(W / 2, 154, 20) +
        // Collar, neck, head.
        `<path d="M100 ${headY + 36} L120 ${headY + 52} L140 ${headY + 36} L140 ${headY + 28} L100 ${headY + 28} Z" fill="#ffffff"/>` +
        `<rect x="112" y="${headY + 16}" width="16" height="16" fill="${SKIN}"/>` +
        hair +
        `<circle cx="120" cy="${headY}" r="20" fill="${SKIN}"/>` +
        (rank === 'QUEEN'
            ? `<path d="M100 ${headY - 2} Q120 ${headY - 30} 140 ${headY - 2} Q120 ${headY - 14} 100 ${headY - 2} Z" fill="#4a2c17"/>`
            : rank === 'KING'
              ? `<path d="M110 ${headY + 12} Q120 ${headY + 24} 130 ${headY + 12} Z" fill="#4a2c17"/>`
              : '') +
        `<circle cx="113" cy="${headY - 2}" r="2" fill="#2b2b33"/><circle cx="127" cy="${headY - 2}" r="2" fill="#2b2b33"/>` +
        regalia +
        prop +
        `</g>`
    );
}

/** A court card: a panel with a diagonal divider and the figure mirrored across the centre. */
function court(rank, colour) {
    return (
        `<g class="court">` +
        `<rect x="48" y="52" width="${W - 96}" height="${H - 104}" rx="8" fill="#ffffff" stroke="${colour}" stroke-opacity="0.45" stroke-width="2"/>` +
        // Each half is clipped to its own side of the panel, so the mirrored figures meet at the middle line.
        `<clipPath id="top"><rect x="49" y="53" width="${W - 98}" height="${H / 2 - 53}"/></clipPath>` +
        `<clipPath id="bottom"><rect x="49" y="${H / 2}" width="${W - 98}" height="${H / 2 - 53}"/></clipPath>` +
        `<rect x="49" y="53" width="${W - 98}" height="${H / 2 - 53}" rx="8" fill="${colour}" fill-opacity="0.06"/>` +
        `<g clip-path="url(#top)">${figure(rank, colour, false)}</g>` +
        `<g clip-path="url(#bottom)">${figure(rank, colour, true)}</g>` +
        `<path d="M49 ${H / 2} H${W - 49}" stroke="${colour}" stroke-opacity="0.35" stroke-width="1.5"/>` +
        `</g>`
    );
}

/** The ace: a large suit inside two ornament rings with four small suits at the compass points. */
function ace() {
    return (
        `<circle cx="${W / 2}" cy="${H / 2}" r="86" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="2"/>` +
        `<circle cx="${W / 2}" cy="${H / 2}" r="78" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="1"/>` +
        glyph(W / 2, H / 2, 112) +
        [
            [W / 2, H / 2 - 100],
            [W / 2, H / 2 + 100, true],
        ]
            .map(([x, y, flip]) => glyph(x, y, 16, Boolean(flip)))
            .join('')
    );
}

function centre(rank, label, pips, colour) {
    if (pips >= 6) {
        return PIPS[pips].map(([x, y]) => glyph(x, y, 44, y > H / 2)).join('');
    }
    if (pips === 1) {
        return ace();
    }
    return court(rank, colour);
}

function face(rank, label, pips, suit) {
    const { colour, shape } = SUITS[suit];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-rank="${rank}" data-suit="${suit}">
<defs><symbol id="suit" viewBox="0 0 100 100" overflow="visible">${shape}</symbol></defs>
${paper()}
<g fill="${colour}" color="${colour}">${centre(rank, label, pips, colour)}</g>
${corner(label, colour)}
<g transform="rotate(180 ${W / 2} ${H / 2})">${corner(label, colour)}</g>
</svg>
`;
}

/** The back: azure field, a fine gold lattice, a double gold border and the brand spade in a medallion. */
function back() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<pattern id="lattice" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="14" height="14" fill="#143f8c"/><path d="M0 7 H14 M7 0 V14" stroke="#2a63c4" stroke-width="1.5"/>
</pattern>
<radialGradient id="shine" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#000000" stop-opacity="0.25"/></radialGradient>
</defs>
${paper()}
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="10" fill="url(#lattice)"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="10" fill="url(#shine)"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="10" fill="none" stroke="${GOLD}" stroke-width="2"/>
<rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="7" fill="none" stroke="${GOLD}" stroke-opacity="0.6" stroke-width="1"/>
<g id="medallion">
<circle cx="${W / 2}" cy="${H / 2}" r="46" fill="#0f2f6b" stroke="${GOLD}" stroke-width="3"/>
<circle cx="${W / 2}" cy="${H / 2}" r="38" fill="none" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="1"/>
<g fill="${GOLD}" transform="translate(${W / 2 - 26} ${H / 2 - 28}) scale(0.52)">${SUITS.SPADES.shape}</g>
</g>
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
