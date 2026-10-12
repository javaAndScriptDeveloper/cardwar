import { useEffect, useState } from 'preact/hooks';
import type { ApiClient } from '../../api/client';
import type { ShopItemView } from '../../api/types';
import { fetchPackIndex } from '../../content/loader';
import type { PackIndexEntry } from '../../content/types';
import { t } from '../../i18n';
import { applyLoadout, pickDeckLocally } from '../../state/loadout';
import { settings, type Toggle, updateSettings } from '../../state/settings';
import { describeError } from '../errors';

const KEYS: Toggle[] = ['sound', 'music', 'haptics', 'swipe', 'reducedMotion'];

export type SettingsApi = Pick<ApiClient, 'shop' | 'equipItem'>;

interface Props {
    /** The installed packs; injectable for tests. */
    loadIndex?: () => Promise<PackIndexEntry[]>;
    /** Signed in: decks are equipped through the shop. Without it a pick only changes this device. */
    api?: SettingsApi | undefined;
    /** Outside Telegram (the dev shim) an unowned deck may still be tried on locally. */
    inTelegram?: boolean;
    onOpenShop?: () => void;
}

/** Device preferences; each control writes through the settings signal, so the game reacts at once. */
export function Settings({ loadIndex = fetchPackIndex, api, inTelegram = false, onOpenShop }: Props) {
    const current = settings.value;
    return (
        <section class="lobby" data-testid="settings-screen">
            <h1>{t('settings.title')}</h1>
            <div class="panel">
                {KEYS.map((key) => (
                    <label key={key} class="toggle">
                        <span>{t(`settings.${key}`)}</span>
                        <input
                            type="checkbox"
                            data-testid={`setting-${key}`}
                            checked={current[key]}
                            onChange={(event) => updateSettings({ [key]: event.currentTarget.checked })}
                        />
                    </label>
                ))}
            </div>
            <DeckPicker
                loadIndex={loadIndex}
                selected={current.deck}
                api={api}
                inTelegram={inTelegram}
                onOpenShop={onOpenShop}
            />
        </section>
    );
}

type IndexState = { kind: 'loading' } | { kind: 'ready'; packs: PackIndexEntry[] } | { kind: 'failed' };

/**
 * The installed content packs, each with a few faces. Signed in, the server loadout decides the deck: an owned one
 * is equipped through the shop, an unowned one links to the shop (and, in the dev shim only, can be tried on here).
 */
function DeckPicker({
    loadIndex,
    selected,
    api,
    inTelegram,
    onOpenShop,
}: {
    loadIndex: () => Promise<PackIndexEntry[]>;
    selected: string;
    api: SettingsApi | undefined;
    inTelegram: boolean;
    onOpenShop: (() => void) | undefined;
}) {
    const [index, setIndex] = useState<IndexState>({ kind: 'loading' });
    /** Deck items by content ref, once the shop answered; undefined means "not signed in or unknown". */
    const [decks, setDecks] = useState<Map<string, ShopItemView>>();
    const [problem, setProblem] = useState<string>();
    useEffect(() => {
        let live = true;
        loadIndex()
            .then((packs) => live && setIndex({ kind: 'ready', packs }))
            .catch(() => live && setIndex({ kind: 'failed' }));
        api?.shop()
            .then(
                (shop) =>
                    live &&
                    setDecks(
                        new Map(
                            shop.items
                                .filter((item) => item.type === 'DECK')
                                .map((item) => [item.contentRef, item]),
                        ),
                    ),
            )
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [loadIndex, api]);

    const pick = async (id: string) => {
        const item = decks?.get(id);
        setProblem(undefined);
        if (api && item?.owned) {
            try {
                applyLoadout(await api.equipItem(item.code));
            } catch (error) {
                setProblem(t('settings.equipFailed', { error: describeError(error) }));
            }
            return;
        }
        if (item && inTelegram) {
            onOpenShop?.();
            return;
        }
        // Not signed in, the shop not answered yet, or the dev shim trying a deck on: this device only.
        pickDeckLocally(id);
    };

    return (
        <div class="panel decks">
            <h2 id="deck-picker-title">{t('settings.deck')}</h2>
            <div role="radiogroup" aria-labelledby="deck-picker-title" data-testid="deck-picker">
                {index.kind === 'failed' && (
                    <p class="hint" data-testid="deck-picker-error">
                        {t('settings.decksUnavailable')}
                    </p>
                )}
                {index.kind === 'ready' &&
                    index.packs.map((pack) => {
                        const item = decks?.get(pack.id);
                        const owned = item === undefined ? undefined : item.owned;
                        return (
                            <div key={pack.id} class="deck-row">
                                <button
                                    type="button"
                                    role="radio"
                                    class={`deck-option${pack.id === selected ? ' selected' : ''}`}
                                    aria-checked={pack.id === selected}
                                    data-testid={`deck-${pack.id}`}
                                    data-owned={owned === undefined ? undefined : String(owned)}
                                    onClick={() => void pick(pack.id)}
                                >
                                    <span class="deck-preview">
                                        {pack.preview.map((path) => (
                                            <img
                                                key={path}
                                                class="card small"
                                                src={`${import.meta.env.BASE_URL}${path}`}
                                                alt=""
                                                draggable={false}
                                            />
                                        ))}
                                    </span>
                                    <span class="name">{pack.name.uk}</span>
                                </button>
                                {owned === false && (
                                    <button
                                        type="button"
                                        class="link"
                                        data-testid={`deck-shop-${pack.id}`}
                                        onClick={onOpenShop}
                                    >
                                        {t('settings.inShop')}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                {problem && (
                    <p class="error" role="alert">
                        {problem}
                    </p>
                )}
            </div>
        </div>
    );
}
