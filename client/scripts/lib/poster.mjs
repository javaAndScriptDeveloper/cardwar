/**
 * Poster-card drawing shared by the satire generators: a persona in display type instead of a likeness (we own
 * none), with the rank and suit in both corners large enough to play by. Pure string building, no dependencies, so
 * a real caricature can replace a face later without touching the manifest.
 */
export const W = 240;
export const H = 336;
export const FONT = "font-family=\"'Trebuchet MS', 'Segoe UI', sans-serif\"";

/** [rank, corner label] low to high; a roster names one persona per rank. */
export const RANKS = [
    ['SIX', '6'],
    ['SEVEN', '7'],
    ['EIGHT', '8'],
    ['NINE', '9'],
    ['TEN', '10'],
    ['JACK', 'J'],
    ['QUEEN', 'Q'],
    ['KING', 'K'],
    ['ACE', 'A'],
];
export const SUITS = {
    CLUBS: { glyph: '♣', colour: '#1d1d24' },
    DIAMONDS: { glyph: '♦', colour: '#c62828' },
    HEARTS: { glyph: '♥', colour: '#c62828' },
    SPADES: { glyph: '♠', colour: '#1d1d24' },
};

const QUOTE_LINE_CHARS = 22;
const QUOTE_LINES = 3;
/** Roughly the width of an average Cyrillic glyph in Trebuchet bold, as a fraction of the font size. */
const GLYPH_EM = 0.58;

export const escapeXml = (text) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy wrap on spaces; a quote that needs more than three lines is a bug in the roster, not a layout problem. */
export function wrap(text, maxChars = QUOTE_LINE_CHARS, maxLines = QUOTE_LINES) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
        if (word.length > maxChars) {
            throw new Error(`word too long for a card: "${word}" in "${text}"`);
        }
        if (line.length === 0) {
            line = word;
        } else if (line.length + 1 + word.length <= maxChars) {
            line += ` ${word}`;
        } else {
            lines.push(line);
            line = word;
        }
    }
    lines.push(line);
    if (lines.length > maxLines) {
        throw new Error(`quote too long for a card (${lines.length} lines): "${text}"`);
    }
    return lines;
}

/** A name longer than the panel breaks at the space nearest its middle. */
function nameLines(name) {
    if (name.length <= 11 || !name.includes(' ')) {
        return [name];
    }
    const middle = name.length / 2;
    let best = -1;
    for (let i = name.indexOf(' '); i !== -1; i = name.indexOf(' ', i + 1)) {
        if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) {
            best = i;
        }
    }
    return [name.slice(0, best), name.slice(best + 1)];
}

/** The largest size up to `max` at which `line` fits `width` pixels, never below 20. */
const fit = (line, max, width = 186) =>
    Math.max(20, Math.min(max, Math.floor(width / (GLYPH_EM * line.length))));

export function frame() {
    return `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="#ffffff" stroke="#b9bcc6" stroke-width="3"/>`;
}

/** Rank and suit top-left and top-right, repeated upside down for the other hand. */
export function corners(label, suit) {
    const { glyph, colour } = SUITS[suit];
    const size = label.length > 1 ? 34 : 40;
    const pair = `<text x="30" y="46" text-anchor="middle" font-size="${size}">${label}</text>
<text x="${W - 30}" y="46" text-anchor="middle" font-size="34">${glyph}</text>`;
    return `<g fill="${colour}" ${FONT} font-weight="700">
${pair}
<g transform="rotate(180 ${W / 2} ${H / 2})">
${pair}
</g>
</g>`;
}

/** `#rrggbb` scaled towards black by `factor` (0.6 = 40% darker). */
export function darken(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const channel = (shift) => Math.round(((n >> shift) & 255) * factor);
    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

/** The look of a persona's avatar; every field has a default so a roster only states what differs. */
export const DEFAULT_LOOK = Object.freeze({
    skin: '#f2d3b1',
    hair: 'short',
    hairColour: '#3b2a1a',
    beard: 'none',
    glasses: 'none',
    clothes: 'suit',
});

export const HAIR = ['short', 'long', 'bob', 'bald', 'buzz', 'braid', 'curly'];
export const BEARD = ['none', 'full', 'stubble', 'goatee'];
export const GLASSES = ['none', 'round', 'square', 'sun'];
export const CLOTHES = ['suit', 'tee', 'hoodie', 'dress', 'uniform'];

/**
 * A flat cartoon bust in a 120×130 box (head at (60,56), shoulders to the bottom edge): hair, beard, glasses and
 * clothes from `look`, the persona's emoji as a badge on the shoulder. Deliberately generic: no likeness, the name
 * and the badge do the recognising. Returns a <g class="avatar"> to place with a transform.
 */
export function avatar(persona) {
    const look = { ...DEFAULT_LOOK, ...(persona.look ?? {}) };
    const { skin, hairColour } = look;
    const dark = darken(persona.colour, 0.55);
    const parts = [];
    // Hair behind the head.
    if (look.hair === 'long') {
        parts.push(
            `<path d="M30 54 Q26 100 36 128 L84 128 Q94 100 90 54 Q60 20 30 54 Z" fill="${hairColour}"/>`,
        );
    } else if (look.hair === 'bob') {
        parts.push(`<path d="M30 56 Q28 92 40 96 L80 96 Q92 92 90 56 Q60 22 30 56 Z" fill="${hairColour}"/>`);
    } else if (look.hair === 'curly') {
        parts.push(
            `<circle cx="38" cy="44" r="14" fill="${hairColour}"/><circle cx="60" cy="30" r="16" fill="${hairColour}"/><circle cx="82" cy="44" r="14" fill="${hairColour}"/><circle cx="34" cy="64" r="11" fill="${hairColour}"/><circle cx="86" cy="64" r="11" fill="${hairColour}"/>`,
        );
    }
    // Shoulders and clothes.
    if (look.clothes === 'suit') {
        parts.push(
            `<path d="M4 130 L14 98 Q60 80 106 98 L116 130 Z" fill="#1f2330"/>`,
            `<path d="M44 94 L60 118 L76 94 L70 90 L60 100 L50 90 Z" fill="#ffffff"/>`,
            `<path d="M56 100 L60 118 L64 100 Z" fill="${persona.colour}"/>`,
        );
    } else if (look.clothes === 'tee') {
        parts.push(
            `<path d="M4 130 L14 98 Q60 80 106 98 L116 130 Z" fill="${dark}"/>`,
            `<path d="M44 92 Q60 108 76 92 Q60 98 44 92 Z" fill="${skin}"/>`,
        );
    } else if (look.clothes === 'hoodie') {
        parts.push(
            `<path d="M4 130 L14 98 Q60 80 106 98 L116 130 Z" fill="${dark}"/>`,
            `<path d="M26 104 Q36 84 60 86 Q84 84 94 104 Q60 92 26 104 Z" fill="${darken(persona.colour, 0.4)}"/>`,
            `<path d="M52 104 V124 M68 104 V124" stroke="#ffffff" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>`,
        );
    } else if (look.clothes === 'dress') {
        parts.push(
            `<path d="M4 130 L14 98 Q60 80 106 98 L116 130 Z" fill="${dark}"/>`,
            `<path d="M42 90 L60 112 L78 90 Q60 100 42 90 Z" fill="${skin}"/>`,
        );
    } else if (look.clothes === 'uniform') {
        parts.push(
            `<path d="M4 130 L14 98 Q60 80 106 98 L116 130 Z" fill="#4b5a2a"/>`,
            `<path d="M44 94 L60 112 L76 94 L70 90 L60 100 L50 90 Z" fill="#6b7a3a"/>`,
            `<rect x="20" y="106" width="20" height="14" rx="2" fill="#3a4620"/><rect x="80" y="106" width="20" height="14" rx="2" fill="#3a4620"/>`,
        );
    }
    // Neck and head.
    parts.push(`<rect x="50" y="72" width="20" height="24" fill="${skin}"/>`);
    parts.push(`<circle cx="60" cy="56" r="26" fill="${skin}"/>`);
    // Beard.
    if (look.beard === 'full') {
        parts.push(
            `<path d="M36 56 Q38 92 60 94 Q82 92 84 56 Q72 84 60 86 Q48 84 36 56 Z" fill="${hairColour}"/>`,
        );
    } else if (look.beard === 'stubble') {
        parts.push(
            `<path d="M38 60 Q42 84 60 84 Q78 84 82 60 Q70 80 60 80 Q50 80 38 60 Z" fill="${hairColour}" fill-opacity="0.35"/>`,
        );
    } else if (look.beard === 'goatee') {
        parts.push(`<path d="M52 74 Q60 90 68 74 Q60 80 52 74 Z" fill="${hairColour}"/>`);
    }
    // Face.
    parts.push(
        `<circle cx="50" cy="54" r="2.6" fill="#2b2b33"/><circle cx="70" cy="54" r="2.6" fill="#2b2b33"/>`,
        `<path d="M52 68 Q60 74 68 68" stroke="#8a4b3a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    );
    // Hair in front.
    if (look.hair === 'short' || look.hair === 'long' || look.hair === 'bob') {
        parts.push(
            `<path d="M34 50 Q36 26 60 26 Q84 26 86 50 Q74 38 60 40 Q46 38 34 50 Z" fill="${hairColour}"/>`,
        );
    } else if (look.hair === 'buzz') {
        parts.push(
            `<path d="M34 48 Q38 30 60 30 Q82 30 86 48 Q70 40 60 40 Q50 40 34 48 Z" fill="${hairColour}" fill-opacity="0.8"/>`,
        );
    } else if (look.hair === 'braid') {
        parts.push(
            `<path d="M34 50 Q36 26 60 26 Q84 26 86 50 Q74 38 60 40 Q46 38 34 50 Z" fill="${hairColour}"/>`,
            `<path d="M32 44 Q60 18 88 44" stroke="${hairColour}" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="9 4"/>`,
        );
    } else if (look.hair === 'curly') {
        parts.push(
            `<path d="M36 48 Q40 34 60 34 Q80 34 84 48 Q70 42 60 42 Q50 42 36 48 Z" fill="${hairColour}"/>`,
        );
    }
    // Glasses.
    if (look.glasses === 'round') {
        parts.push(
            `<g fill="none" stroke="#2b2b33" stroke-width="2.2"><circle cx="50" cy="55" r="8"/><circle cx="70" cy="55" r="8"/><path d="M58 55 H62"/></g>`,
        );
    } else if (look.glasses === 'square') {
        parts.push(
            `<g fill="none" stroke="#2b2b33" stroke-width="2.2"><rect x="41" y="48" width="17" height="13" rx="2"/><rect x="62" y="48" width="17" height="13" rx="2"/><path d="M58 54 H62"/></g>`,
        );
    } else if (look.glasses === 'sun') {
        parts.push(
            `<g fill="#1b1d2a"><rect x="40" y="47" width="18" height="14" rx="4"/><rect x="62" y="47" width="18" height="14" rx="4"/><path d="M58 53 H62" stroke="#1b1d2a" stroke-width="2"/></g>`,
        );
    }
    // Emoji badge on the shoulder.
    parts.push(
        `<circle cx="100" cy="112" r="15" fill="#ffffff" fill-opacity="0.95"/>`,
        `<text x="100" y="118" text-anchor="middle" font-size="17">${persona.emoji}</text>`,
    );
    return `<g class="avatar">${parts.join('\n')}</g>`;
}

/** The tilted «САТИРА» stamp, so nobody mistakes a poster for a claim. */
function stamp(x, y) {
    return `<g class="stamp" transform="translate(${x} ${y}) rotate(-14)">
<rect x="-32" y="-10" width="64" height="20" rx="3" fill="#ffffff" fill-opacity="0.92" stroke="#e53935" stroke-width="2"/>
<text x="0" y="4" text-anchor="middle" ${FONT} font-weight="700" font-size="11" letter-spacing="1.5" fill="#e53935">САТИРА</text>
</g>`;
}

/**
 * One face: a colour panel (gradient and halftone) with a faint suit glyph, the persona's avatar, a name band, the
 * role, the quote at the bottom, and the satire stamp. Corners carry rank and suit for both hands.
 */
export function face({ label, suit, persona, quote }) {
    const { glyph } = SUITS[suit];
    const names = nameLines(persona.name);
    const nameSize = Math.min(...names.map((line) => fit(line, names.length === 1 ? 26 : 20, 180)));
    const nameY = names.length === 1 ? [200] : [191, 213];
    const quoteLines = wrap(quote);
    const firstQuoteY = 280 - 14 * (quoteLines.length - 1);
    const id = `${persona.tag}-${suit.toLowerCase()}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<linearGradient id="g-${id}" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${persona.colour}"/><stop offset="1" stop-color="${darken(persona.colour, 0.55)}"/></linearGradient>
<pattern id="h-${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2" cy="2" r="1.1" fill="#ffffff" fill-opacity="0.09"/></pattern>
<clipPath id="c-${id}"><rect x="14" y="50" width="${W - 28}" height="236" rx="14"/></clipPath>
</defs>
${frame()}
<rect x="14" y="50" width="${W - 28}" height="236" rx="14" fill="url(#g-${id})"/>
<rect x="14" y="50" width="${W - 28}" height="236" rx="14" fill="url(#h-${id})"/>
<g clip-path="url(#c-${id})">
<text x="${W - 22}" y="168" text-anchor="end" ${FONT} font-weight="700" font-size="170" fill="#ffffff" fill-opacity="0.08">${glyph}</text>
<g transform="translate(60 48) scale(1)">${avatar(persona)}</g>
<rect x="14" y="176" width="${W - 28}" height="48" fill="#000000" fill-opacity="0.42"/>
</g>
<rect x="14" y="50" width="${W - 28}" height="236" rx="14" fill="none" stroke="#ffffff" stroke-opacity="0.25"/>
${names
    .map(
        (line, i) =>
            `<text x="${W / 2}" y="${nameY[i]}" text-anchor="middle" ${FONT} font-weight="700" font-size="${nameSize}" letter-spacing="0.5" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join('\n')}
<text x="${W / 2}" y="236" text-anchor="middle" ${FONT} font-size="13" fill="#ffffff" fill-opacity="0.85">${escapeXml(persona.role)}</text>
${quoteLines
    .map(
        (line, i) =>
            `<text x="${W / 2}" y="${firstQuoteY + 14 * i}" text-anchor="middle" ${FONT} font-style="italic" font-size="12.5" fill="#ffffff" fill-opacity="0.95">${escapeXml(line)}</text>`,
    )
    .join('\n')}
${stamp(186, 70)}
${corners(label, suit)}
</svg>
`;
}
