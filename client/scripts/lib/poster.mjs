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

/**
 * One face: persona colour panel, satire pill, emoji badge, name (one or two lines), role, and the quote in a
 * ribbon at the bottom of the panel. A faint suit glyph behind everything helps telling suits apart at a glance.
 */
export function face({ label, suit, persona, quote }) {
    const { glyph } = SUITS[suit];
    const names = nameLines(persona.name);
    const nameSize = Math.min(...names.map((line) => fit(line, names.length === 1 ? 32 : 26)));
    const nameY = names.length === 1 ? [152] : [140, 170];
    const roleY = names.length === 1 ? 180 : 194;
    const quoteLines = wrap(quote);
    const firstQuoteY = 246 - 9 * (quoteLines.length - 1);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${frame()}
<rect x="18" y="54" width="${W - 36}" height="228" rx="12" fill="${persona.colour}"/>
<text x="${W / 2}" y="218" text-anchor="middle" ${FONT} font-weight="700" font-size="150" fill="#ffffff" fill-opacity="0.1">${glyph}</text>
<rect x="26" y="60" width="60" height="16" rx="8" fill="#ffffff" fill-opacity="0.92"/>
<text x="56" y="72" text-anchor="middle" ${FONT} font-weight="700" font-size="10" letter-spacing="1" fill="${persona.colour}">САТИРА</text>
<circle cx="${W / 2}" cy="98" r="22" fill="#ffffff" fill-opacity="0.92"/>
<text x="${W / 2}" y="107" text-anchor="middle" font-size="24">${persona.emoji}</text>
${names
    .map(
        (line, i) =>
            `<text x="${W / 2}" y="${nameY[i]}" text-anchor="middle" ${FONT} font-weight="700" font-size="${nameSize}" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join('\n')}
<text x="${W / 2}" y="${roleY}" text-anchor="middle" ${FONT} font-size="15" fill="#ffffff" fill-opacity="0.9">${escapeXml(persona.role)}</text>
<rect x="26" y="206" width="${W - 52}" height="70" rx="8" fill="#000000" fill-opacity="0.28"/>
${quoteLines
    .map(
        (line, i) =>
            `<text x="${W / 2}" y="${firstQuoteY + 18 * i}" text-anchor="middle" ${FONT} font-style="italic" font-size="14" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join('\n')}
${corners(label, suit)}
</svg>
`;
}
