import { assetUrl, equipped } from '../content/loader';
import type { PackManifest } from '../content/types';
import { type Card, cardId } from '../game/cards';
import { cardLabel, t } from '../i18n';

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

export function CardBack({ class: className }: { class?: string }) {
    return <img class={className ?? 'card'} src={backUrl()} alt={t('card.back')} draggable={false} />;
}
