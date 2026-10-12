import { useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Tabs } from '../kit';

const TABS = ['decks', 'backs', 'tables', 'frames', 'emotes'] as const;

/** The shop's shape (one tab per cosmetic type); items and prices arrive with MVP 5. */
export function Shop() {
    const [tab, setTab] = useState<string>('decks');
    return (
        <section class="lobby" data-testid="shop-screen">
            <h1>{t('shop.title')}</h1>
            <Tabs
                tabs={TABS.map((id) => ({ id, label: t(`shop.tabs.${id}`) }))}
                active={tab}
                onChange={setTab}
            />
            <div class="empty-state">
                <p class="notice">{t('shop.soon')}</p>
            </div>
        </section>
    );
}
