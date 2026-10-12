import { assetUrl, equipped } from '../content/loader';
import type { PackManifest } from '../content/types';
import { type Card, cardId } from '../game/cards';
import { cardLabel, t } from '../i18n';
import { styleRef } from './cosmetics';

/**
 * The one place a card becomes an image, so nothing else should build card URLs. Faces come from the equipped
 * content pack; with none (or while it loads) the classic SVGs, whose paths are the catalog seed's image_ref.
 */
export function cardImageUrl(card: Card, pack: PackManifest | undefined = equipped.value): string {
    const image = pack?.cards[cardId(card)]?.image;
    if (pack && image) {
        return assetUrl(pack.id, image);
    }
    return `${import.meta.env.BASE_URL}cards/classic/${card.rank.toLowerCase()}_of_${card.suit.toLowerCase()}.svg`;
}

function backUrl(pack: PackManifest | undefined = equipped.value): string {
    return pack?.back ? assetUrl(pack.id, pack.back) : `${import.meta.env.BASE_URL}cards/classic/back.svg`;
}

export function CardImage({
    card,
    class: className,
    ...rest
}: {
    card: Card;
    class?: string;
    'data-testid'?: string;
    'data-card'?: string;
    'data-suit'?: string;
}) {
    return (
        <img
            class={className ?? 'card'}
            src={cardImageUrl(card)}
            alt={cardLabel(card)}
            draggable={false}
            {...rest}
        />
    );
}

/**
 * A card back. The classic back is the equipped pack's own back image; any other (a shop card back) is a built-in
 * CSS style, so it needs no asset and looks the same whatever deck the viewer has equipped.
 */
export function CardBack({
    class: className,
    back = 'classic',
}: {
    class?: string;
    back?: string | undefined;
}) {
    const ref = styleRef(back, 'classic');
    if (ref !== 'classic') {
        return (
            <span
                class={`${className ?? 'card'} card-back-style back-${ref}`}
                role="img"
                aria-label={t('card.back')}
                data-back={ref}
            />
        );
    }
    return (
        <img
            class={className ?? 'card'}
            src={backUrl()}
            alt={t('card.back')}
            draggable={false}
            data-back="classic"
        />
    );
}
