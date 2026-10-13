/**
 * Built-in cosmetic styles keyed by the shop's contentRef. Card backs, tables and frames are pure CSS (styles.css,
 * `.back-<ref>`, `.table-<ref>`, `.frame-<ref>`), emotes are emoji glyphs: none of them needs an asset download,
 * and an unknown ref still renders as something neutral rather than a broken image.
 */

const EMOTE_GLYPHS: Readonly<Record<string, string>> = {
    like: '👍',
    laugh: '😂',
    clown: '🤡',
    fire: '🔥',
};

/**
 * Phrase emotes: a glyph plus the words, shown together at the table and in the tray. The text is content keyed
 * by the shop's ref (the server names the item the same way), not interface copy, so it lives here with the glyph.
 */
export const EMOTE_PHRASES: Readonly<Record<string, { glyph: string; text: string }>> = {
    'minus-money': { glyph: '💸', text: 'Мінус гроші' },
    chumachecha: { glyph: '🍂', text: 'Чумачеча осінь' },
    'ty-sho': { glyph: '🥊', text: 'Ти шо, Кличко?' },
    palianytsia: { glyph: '🍞', text: 'Скажи «паляниця»' },
    bavovna: { glyph: '💥', text: 'Бавовна!' },
    'dobroho-vechora': { glyph: '🌙', text: 'Доброго вечора, ми з України' },
};

const REF = /^[a-z0-9][a-z0-9-]*$/;

/** A ref safe to put into a class name; anything else falls back to the default look. */
export function styleRef(ref: string | undefined, fallback: string): string {
    return ref !== undefined && REF.test(ref) ? ref : fallback;
}

export function emoteGlyph(ref: string): string {
    return EMOTE_GLYPHS[ref] ?? EMOTE_PHRASES[ref]?.glyph ?? '💬';
}

/** The words of a phrase emote; undefined for a plain glyph emote. */
export function emotePhrase(ref: string): string | undefined {
    return EMOTE_PHRASES[ref]?.text;
}

/** The shop item code of an emote ref; the seed names every emote item `emote-<ref>`. */
export function emoteCode(ref: string): string {
    return `emote-${ref}`;
}

/**
 * A small card-back sample, for the shop and anywhere a back is shown without a card. The classic back is the
 * classic deck's own image (what a buyer gets by default); every other back is drawn in CSS.
 */
export function BackSwatch({ back }: { back: string }) {
    const ref = styleRef(back, 'classic');
    if (ref === 'classic') {
        return (
            <img
                class="card small"
                src={`${import.meta.env.BASE_URL}cards/classic/back.svg`}
                alt=""
                draggable={false}
                data-back={ref}
                aria-hidden="true"
            />
        );
    }
    return <span class={`card small card-back-style back-${ref}`} data-back={ref} aria-hidden="true" />;
}

export function TableSwatch({ table }: { table: string }) {
    const ref = styleRef(table, 'green');
    return <span class={`table-swatch table-${ref}`} data-table={ref} aria-hidden="true" />;
}

export function FrameSwatch({ frame }: { frame: string }) {
    const ref = styleRef(frame, 'none');
    return (
        <span class={`avatar-frame frame-${ref}`} data-frame={ref} aria-hidden="true">
            <span class="avatar initials frame-sample" />
        </span>
    );
}
