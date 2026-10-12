import { useEffect, useState } from 'preact/hooks';
import { fetchPackIndex } from '../../content/loader';
import type { PackIndexEntry } from '../../content/types';
import { t } from '../../i18n';
import { settings, type Toggle, updateSettings } from '../../state/settings';

const KEYS: Toggle[] = ['sound', 'music', 'haptics', 'swipe', 'reducedMotion'];

interface Props {
    /** The installed packs; injectable for tests. */
    loadIndex?: () => Promise<PackIndexEntry[]>;
}

/** Device preferences; each control writes through the settings signal, so the game reacts at once. */
export function Settings({ loadIndex = fetchPackIndex }: Props) {
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
            <DeckPicker loadIndex={loadIndex} selected={current.deck} />
        </section>
    );
}

type IndexState = { kind: 'loading' } | { kind: 'ready'; packs: PackIndexEntry[] } | { kind: 'failed' };

/** The installed content packs, each with a few faces; picking one equips it on this device. */
function DeckPicker({
    loadIndex,
    selected,
}: {
    loadIndex: () => Promise<PackIndexEntry[]>;
    selected: string;
}) {
    const [index, setIndex] = useState<IndexState>({ kind: 'loading' });
    useEffect(() => {
        let live = true;
        loadIndex()
            .then((packs) => live && setIndex({ kind: 'ready', packs }))
            .catch(() => live && setIndex({ kind: 'failed' }));
        return () => {
            live = false;
        };
    }, [loadIndex]);

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
                    index.packs.map((pack) => (
                        <button
                            key={pack.id}
                            type="button"
                            role="radio"
                            class={`deck-option${pack.id === selected ? ' selected' : ''}`}
                            aria-checked={pack.id === selected}
                            data-testid={`deck-${pack.id}`}
                            onClick={() => updateSettings({ deck: pack.id })}
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
                    ))}
            </div>
        </div>
    );
}
