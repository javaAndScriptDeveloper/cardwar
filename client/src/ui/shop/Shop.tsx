import { useEffect, useState } from 'preact/hooks';
import { ApiError, type ApiClient } from '../../api/client';
import type { CoinPackView, ItemType, ShopItemView } from '../../api/types';
import { audio, type AudioManager } from '../../audio';
import { fetchPackIndex } from '../../content/loader';
import type { PackIndexEntry } from '../../content/types';
import { t } from '../../i18n';
import { applyLoadout, refreshLoadout } from '../../state/loadout';
import { awaitCredit, refreshWallet, wallet } from '../../state/wallet';
import type { Telegram } from '../../telegram/webapp';
import { BackSwatch, emoteGlyph, FrameSwatch, TableSwatch } from '../cosmetics';
import { describeError } from '../errors';
import { Badge, Button, CoinAmount, Tabs, Toast } from '../kit';

export type ShopApi = Pick<
    ApiClient,
    'shop' | 'buyItem' | 'equipItem' | 'starsInvoice' | 'wallet' | 'loadout'
>;

const ITEM_TABS = {
    decks: 'DECK',
    backs: 'CARD_BACK',
    tables: 'TABLE',
    frames: 'FRAME',
    emotes: 'EMOTE',
} as const;
type ItemTab = keyof typeof ITEM_TABS;
type Tab = ItemTab | 'coins';
const TABS: Tab[] = ['decks', 'backs', 'tables', 'frames', 'emotes', 'coins'];

interface Props {
    api: ShopApi;
    telegram: Pick<Telegram, 'openInvoice'>;
    /** The installed packs, for deck previews; injectable for tests. */
    loadIndex?: () => Promise<PackIndexEntry[]>;
    /** Plays a deck's demo sound; injectable for tests. */
    sound?: Pick<AudioManager, 'register' | 'play'>;
}

/** A silent deck still answers a tap on its preview, with the sound a beaten card makes. */
const SILENT_DECK_DEMO = 'beat';

/** The countdown is coarse (days and hours), so a tick a minute keeps it honest without churn. */
const COUNTDOWN_TICK_MS = 60_000;

type Catalog =
    | { kind: 'loading' }
    | { kind: 'ready'; items: ShopItemView[]; drops: ShopItemView[]; coinPacks: CoinPackView[] }
    | { kind: 'failed'; error: string };

/** One sentence per refusal the shop endpoints document; anything else names the generic failure. */
function problem(error: unknown): { text: string; reason: string } {
    const reason = error instanceof ApiError ? error.reason : undefined;
    switch (reason) {
        case 'INSUFFICIENT_COINS':
            return { text: t('shop.errors.insufficientCoins'), reason };
        case 'ALREADY_OWNED':
            return { text: t('shop.errors.alreadyOwned'), reason };
        case 'NOT_OWNED':
            return { text: t('shop.errors.notOwned'), reason };
        case 'NOT_FOR_SALE':
            return { text: t('shop.errors.notForSale'), reason };
        case 'NOT_ON_SALE':
            return { text: t('shop.errors.notOnSale'), reason };
        case 'PAYMENTS_UNAVAILABLE':
            return { text: t('shop.errors.paymentsUnavailable'), reason };
    }
    return { text: t('shop.errors.generic', { error: describeError(error) }), reason: reason ?? 'generic' };
}

/** A drop on sale right now: the server put it in `drops` and gave it an end. */
const onSale = (item: ShopItemView) => item.availableUntil !== undefined;

/** An item the player cannot buy today: earned by a streak, or a drop out of its week. */
const locked = (item: ShopItemView) => !item.owned && item.unlock !== undefined && !item.unlock.met;

/**
 * Cosmetics for coins and coins for Telegram Stars. Prices and ownership come from the server on every visit; the
 * client only shows them and asks. Equipping writes the server loadout, which also moves the device's deck. Which
 * items are locked, earned or on sale this week is the server's call too: the shop only draws the badge.
 */
export function Shop({ api, telegram, loadIndex = fetchPackIndex, sound = audio }: Props) {
    const [tab, setTab] = useState<string>('decks');
    const [catalog, setCatalog] = useState<Catalog>({ kind: 'loading' });
    const [packs, setPacks] = useState<Record<string, PackIndexEntry>>({});
    const [busy, setBusy] = useState<string>();
    const [now, setNow] = useState(() => Date.now());

    const playDemo = (pack: PackIndexEntry | undefined) => {
        if (!pack?.demoSound) {
            sound.play(SILENT_DECK_DEMO);
            return;
        }
        const name = `demo:${pack.id}`;
        sound.register(name, `${import.meta.env.BASE_URL}${pack.demoSound}`, 'voice');
        sound.play(name);
    };
    const [message, setMessage] = useState<{ text: string; reason: string }>();

    useEffect(() => {
        let live = true;
        api.shop()
            .then((view) => live && setCatalog({ kind: 'ready', ...view }))
            .catch((error: unknown) => live && setCatalog({ kind: 'failed', error: describeError(error) }));
        loadIndex()
            .then((packs) => live && setPacks(Object.fromEntries(packs.map((pack) => [pack.id, pack]))))
            .catch(() => {});
        return () => {
            live = false;
        };
    }, [api, loadIndex]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
        return () => clearInterval(timer);
    }, []);

    const replaceItems = (update: (items: ShopItemView[]) => ShopItemView[]) =>
        setCatalog((current) =>
            current.kind === 'ready'
                ? { ...current, items: update(current.items), drops: update(current.drops) }
                : current,
        );

    const run = async (key: string, action: () => Promise<void>) => {
        setBusy(key);
        setMessage(undefined);
        try {
            await action();
        } catch (error) {
            setMessage(problem(error));
        } finally {
            setBusy(undefined);
        }
    };

    const buy = (item: ShopItemView) =>
        run(item.code, async () => {
            const bought = await api.buyItem(item.code);
            replaceItems((items) => items.map((other) => (other.code === bought.code ? bought : other)));
            // The loadout lists owned emotes, so a purchase can change what the table tray offers.
            await Promise.all([refreshWallet(api), refreshLoadout(api)]);
        });

    const equip = (item: ShopItemView) =>
        run(item.code, async () => {
            applyLoadout(await api.equipItem(item.code));
            replaceItems((items) =>
                items.map((other) =>
                    other.type === item.type ? { ...other, equipped: other.code === item.code } : other,
                ),
            );
        });

    const topUp = (pack: CoinPackView) =>
        run(pack.id, async () => {
            const { invoiceLink } = await api.starsInvoice(pack.id);
            telegram.openInvoice(invoiceLink, (status) => {
                if (status === 'paid') {
                    setMessage({ text: t('shop.creditPending'), reason: 'credit-pending' });
                    void awaitCredit(api, wallet.value?.balance ?? 0).then((credited) => {
                        if (credited) {
                            setMessage({ text: t('shop.paid'), reason: 'paid' });
                        }
                    });
                } else if (status === 'failed') {
                    setMessage({ text: t('shop.errors.paymentFailed'), reason: 'payment-failed' });
                }
            });
        });

    const card = (item: ShopItemView) => (
        <ItemCard
            key={item.code}
            item={item}
            preview={packs[item.contentRef]?.preview}
            onPreview={() => playDemo(packs[item.contentRef])}
            busy={busy}
            now={now}
            onBuy={() => void buy(item)}
            onEquip={() => void equip(item)}
        />
    );

    const current = wallet.value;
    return (
        <section class="lobby" data-testid="shop-screen">
            <header class="lobby-header">
                <h1>{t('shop.title')}</h1>
                {current && (
                    <span
                        class="balance-chip"
                        data-testid="balance"
                        data-balance={current.balance}
                        aria-label={t('lobby.balance')}
                    >
                        <CoinAmount amount={current.balance} />
                    </span>
                )}
            </header>
            <Tabs
                tabs={TABS.map((id) => ({ id, label: t(`shop.tabs.${id}`) }))}
                active={tab}
                onChange={setTab}
            />
            {catalog.kind === 'loading' && <p class="notice">{t('app.loading')}</p>}
            {catalog.kind === 'failed' && (
                <p class="error">{t('shop.loadFailed', { error: catalog.error })}</p>
            )}
            {catalog.kind === 'ready' && tab === 'coins' && (
                <div class="shop-grid">
                    {catalog.coinPacks.map((pack) => (
                        <div key={pack.id} class="shop-item coin-pack" data-testid={`coin-pack-${pack.id}`}>
                            <span class="shop-preview coin-stack" aria-hidden="true">
                                <span class="coin-glyph" />
                            </span>
                            <CoinAmount amount={pack.coins} data-testid="pack-coins" />
                            <Button
                                variant="primary"
                                busy={busy === pack.id}
                                disabled={busy !== undefined}
                                onClick={() => void topUp(pack)}
                            >
                                {t('shop.stars', { n: pack.stars })}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            {catalog.kind === 'ready' && tab !== 'coins' && catalog.drops.length > 0 && (
                <section class="drops" data-testid="drops">
                    <h2>{t('shop.drop.title')}</h2>
                    <div class="shop-grid">{catalog.drops.map(card)}</div>
                </section>
            )}
            {catalog.kind === 'ready' && tab !== 'coins' && (
                <div class="shop-grid">
                    {catalog.items
                        // A drop on sale is shown once, in its own section above.
                        .filter((item) => item.type === ITEM_TABS[tab as ItemTab] && !onSale(item))
                        .map(card)}
                </div>
            )}
            <Toast message={message?.text} reason={message?.reason} />
        </section>
    );
}

interface ItemCardProps {
    item: ShopItemView;
    preview: string[] | undefined;
    onPreview: () => void;
    busy: string | undefined;
    now: number;
    onBuy: () => void;
    onEquip: () => void;
}

/** Emotes are owned, never equipped: every owned emote is in the tray at the table. */
const EQUIPPABLE: ReadonlySet<ItemType> = new Set(['DECK', 'CARD_BACK', 'TABLE', 'FRAME']);

function ItemCard({ item, preview, onPreview, busy, now, onBuy, onEquip }: ItemCardProps) {
    const isLocked = locked(item);
    const action = (() => {
        if (isLocked && item.unlock) {
            return <Lock item={item} />;
        }
        if (!item.owned) {
            return (
                <Button
                    variant="primary"
                    busy={busy === item.code}
                    disabled={busy !== undefined}
                    onClick={onBuy}
                    data-testid={`buy-${item.code}`}
                >
                    {t('shop.buy')}
                </Button>
            );
        }
        if (!EQUIPPABLE.has(item.type)) {
            return <Badge tone="success">{t('shop.owned')}</Badge>;
        }
        if (item.equipped) {
            return <Badge tone="accent">{t('shop.equipped')}</Badge>;
        }
        return (
            <Button
                busy={busy === item.code}
                disabled={busy !== undefined}
                onClick={onEquip}
                data-testid={`equip-${item.code}`}
            >
                {t('shop.equip')}
            </Button>
        );
    })();

    return (
        <div
            class={`shop-item${item.equipped ? ' equipped' : ''}${isLocked ? ' locked' : ''}`}
            data-testid={`item-${item.code}`}
            data-owned={String(item.owned)}
            data-equipped={String(item.equipped)}
        >
            {item.type === 'DECK' ? (
                // Tapping a deck lets you hear it before buying: its demo sound plays on the voice channel.
                <button
                    type="button"
                    class="shop-preview playable"
                    aria-label={t('shop.playDemo', { name: item.name })}
                    data-testid={`preview-${item.code}`}
                    onClick={onPreview}
                >
                    <Preview item={item} images={preview} />
                </button>
            ) : (
                <span class="shop-preview">
                    <Preview item={item} images={preview} />
                </span>
            )}
            <span class="name">{item.name}</span>
            {!item.owned && !isLocked && <CoinAmount amount={item.price} data-testid="price" />}
            {item.availableUntil !== undefined && !item.owned && (
                <Countdown until={item.availableUntil} now={now} />
            )}
            {action}
        </div>
    );
}

/** Why this item is not for sale today: the streak it takes, or that its drop week will come round again. */
function Lock({ item }: { item: ShopItemView }) {
    const unlock = item.unlock;
    if (!unlock) {
        return null;
    }
    const label =
        unlock.kind === 'WIN_STREAK' ? t('shop.unlock.streak', { n: unlock.value }) : t('shop.drop.returns');
    return (
        <span class="lock" data-testid={`lock-${item.code}`} data-unlock={`${unlock.kind}:${unlock.value}`}>
            <Badge>{label}</Badge>
        </span>
    );
}

/** Days and hours until the drop leaves the shop; the server set the end, the client only counts. */
function Countdown({ until, now }: { until: string; now: number }) {
    const left = Math.max(0, Date.parse(until) - now);
    const days = Math.floor(left / 86_400_000);
    const hours = Math.floor((left % 86_400_000) / 3_600_000);
    return (
        <span class="drop-countdown" data-testid="drop-countdown" data-days={days} data-hours={hours}>
            {t('shop.drop.left', { d: days, h: hours })}
        </span>
    );
}

function Preview({ item, images }: { item: ShopItemView; images: string[] | undefined }) {
    switch (item.type) {
        case 'DECK':
            return (
                <span class="deck-preview">
                    {(images ?? []).slice(0, 3).map((path) => (
                        <img
                            key={path}
                            class="card small"
                            src={`${import.meta.env.BASE_URL}${path}`}
                            alt=""
                            draggable={false}
                        />
                    ))}
                </span>
            );
        case 'CARD_BACK':
            return <BackSwatch back={item.contentRef} />;
        case 'TABLE':
            return <TableSwatch table={item.contentRef} />;
        case 'FRAME':
            return <FrameSwatch frame={item.contentRef} />;
        case 'EMOTE':
            // The item's name already is the phrase, so the preview shows the glyph alone.
            return (
                <span class="emote-glyph" data-emote={item.contentRef} aria-hidden="true">
                    {emoteGlyph(item.contentRef)}
                </span>
            );
    }
}
