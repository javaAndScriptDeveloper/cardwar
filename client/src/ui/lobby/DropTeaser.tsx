import type { ShopItemView } from '../../api/types';
import { t } from '../../i18n';
import { Button } from '../kit';

interface Props {
    drop: ShopItemView;
    onOpenShop: () => void;
    now?: () => number;
}

/** This week's drop, named and counted down, with one tap into the shop. The server decides what is on sale. */
export function DropTeaser({ drop, onOpenShop, now = Date.now }: Props) {
    const left = drop.availableUntil ? Math.max(0, Date.parse(drop.availableUntil) - now()) : 0;
    const days = Math.floor(left / 86_400_000);
    const hours = Math.floor((left % 86_400_000) / 3_600_000);
    return (
        <div class="panel drop-teaser" data-testid="drop-teaser" data-code={drop.code}>
            <div class="row">
                <span class="title">{t('shop.drop.title')}</span>
                {drop.availableUntil && (
                    <span class="drop-countdown">{t('shop.drop.left', { d: days, h: hours })}</span>
                )}
            </div>
            <div class="row">
                <span class="drop-name">{drop.name}</span>
                <Button variant="secondary" onClick={onOpenShop} data-testid="open-shop">
                    {t('lobby.drop.open')}
                </Button>
            </div>
        </div>
    );
}
