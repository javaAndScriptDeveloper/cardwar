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

const REF = /^[a-z0-9][a-z0-9-]*$/;

/** A ref safe to put into a class name; anything else falls back to the default look. */
export function styleRef(ref: string | undefined, fallback: string): string {
    return ref !== undefined && REF.test(ref) ? ref : fallback;
}

export function emoteGlyph(ref: string): string {
    return EMOTE_GLYPHS[ref] ?? '💬';
}

/** The shop item code of an emote ref; the seed names every emote item `emote-<ref>`. */
export function emoteCode(ref: string): string {
    return `emote-${ref}`;
}

/** A small card-back sample, for the shop and anywhere a back is shown without a card. */
export function BackSwatch({ back }: { back: string }) {
    const ref = styleRef(back, 'classic');
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
