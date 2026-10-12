import type { Card } from '../game/cards';
import { cardLabel, t } from '../i18n';

/**
 * The one place a card becomes an image. Skins will later swap this for a catalog lookup (the seed's image_ref is
 * already `classic/<rank>_of_<suit>.svg`), so nothing else should build card URLs.
 */
export function cardImageUrl(card: Card): string {
    return `${import.meta.env.BASE_URL}cards/classic/${card.rank.toLowerCase()}_of_${card.suit.toLowerCase()}.svg`;
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
    return (
        <img
            class={className ?? 'card'}
            src={`${import.meta.env.BASE_URL}cards/classic/back.svg`}
            alt={t('card.back')}
            draggable={false}
        />
    );
}
