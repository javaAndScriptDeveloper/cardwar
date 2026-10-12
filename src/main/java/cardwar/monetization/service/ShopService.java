package cardwar.monetization.service;

import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.exception.NotFoundException;
import cardwar.monetization.domain.LoadoutSlot;
import cardwar.monetization.domain.OwnedItem;
import cardwar.monetization.domain.ShopItem;
import cardwar.monetization.dto.CosmeticsView;
import cardwar.monetization.dto.ItemType;
import cardwar.monetization.dto.LoadoutView;
import cardwar.monetization.dto.ShopItemView;
import cardwar.monetization.dto.ShopView;
import cardwar.monetization.dto.UnlockKind;
import cardwar.monetization.dto.UnlockView;
import cardwar.monetization.grant.StreakSource;
import cardwar.monetization.repository.LoadoutSlotRepository;
import cardwar.monetization.repository.OwnedItemRepository;
import cardwar.monetization.repository.ShopItemRepository;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.WalletService;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cosmetics for coins. Default items are owned by everybody without a row; a purchase debits the wallet and records
 * ownership in one transaction, so nobody pays for something they did not get. Emotes are not equipped: owning one
 * is enough to use it.
 *
 * <p>Two kinds of item are not plain purchases. An earned item (WIN_STREAK) is never sold: the shop grants it the
 * first time it sees the player's best streak reach the bar. A drop is sold one week in four, by the ISO week in
 * Kyiv time, and the view tells the client when that week ends.
 */
@Slf4j
@Service
public class ShopService {

    /** Drop weeks turn over at Kyiv midnight, not UTC: that is when the players see Monday arrive. */
    static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");

    static final int DROP_SLOTS = 4;

    private static final String STREAK_SOURCE = "STREAK";

    private final ShopItemRepository items;
    private final OwnedItemRepository owned;
    private final LoadoutSlotRepository loadout;
    private final WalletService wallets;
    private final StarsService stars;
    private final StreakSource streaks;
    private final Clock clock;

    public ShopService(
            ShopItemRepository items,
            OwnedItemRepository owned,
            LoadoutSlotRepository loadout,
            WalletService wallets,
            StarsService stars,
            StreakSource streaks,
            Clock clock) {
        this.items = items;
        this.owned = owned;
        this.loadout = loadout;
        this.wallets = wallets;
        this.stars = stars;
        this.streaks = streaks;
        this.clock = clock;
    }

    /** Not read-only: a visit is when earned items are granted, so the player sees them the moment they qualify. */
    @Transactional
    public ShopView shop(UUID playerId) {
        List<ShopItem> all = items.findByActiveTrueOrderByTypeAscSortOrderAsc();
        Set<String> mine = new HashSet<>(ownedCodes(playerId));
        grantEarned(playerId, all, mine);
        Map<ItemType, ShopItem> equipped = equipped(playerId);
        DropWeek week = DropWeek.at(clock.instant());
        List<ShopItemView> views =
                all.stream().map(item -> view(item, mine, equipped, week)).toList();
        List<ShopItemView> drops =
                views.stream().filter(view -> view.availableUntil() != null).toList();
        return new ShopView(views, drops, stars.packs());
    }

    @Transactional
    public ShopItemView buy(UUID playerId, String code) {
        ShopItem item = require(code);
        if (item.isEarned()) {
            throw new BadRequestException("Earned by a win streak, not sold", "NOT_FOR_SALE");
        }
        if (item.isDefaultItem() || owned.existsById(new OwnedItem.Key(playerId, code))) {
            throw new ConflictException("Already owned", "ALREADY_OWNED");
        }
        DropWeek week = DropWeek.at(clock.instant());
        if (item.isDrop() && !week.sells(item.getDropSlot())) {
            throw new BadRequestException("This drop is not on sale this week", "NOT_ON_SALE");
        }
        wallets.debit(playerId, item.getPrice(), CoinKind.PURCHASE, "item:" + code);
        owned.save(new OwnedItem(playerId, code, "COINS", clock.instant()));
        log.info("Player {} bought {}", playerId, code);
        return view(item, Set.of(code), equipped(playerId), week);
    }

    @Transactional
    public LoadoutView equip(UUID playerId, String code) {
        ShopItem item = require(code);
        if (item.getType() == ItemType.EMOTE) {
            throw new BadRequestException("Emotes are used, not equipped", "NOT_EQUIPPABLE");
        }
        if (!item.isDefaultItem() && !owned.existsById(new OwnedItem.Key(playerId, code))) {
            throw new BadRequestException("Buy it first", "NOT_OWNED");
        }
        loadout.findById(new LoadoutSlot.Key(playerId, item.getType()))
                .ifPresentOrElse(
                        slot -> slot.equip(code), () -> loadout.save(new LoadoutSlot(playerId, item.getType(), code)));
        loadout.flush();
        return loadoutOf(playerId);
    }

    @Transactional(readOnly = true)
    public LoadoutView loadoutOf(UUID playerId) {
        Map<ItemType, ShopItem> equipped = equipped(playerId);
        Set<String> mine = ownedCodes(playerId);
        List<String> emotes = items.findByActiveTrueOrderByTypeAscSortOrderAsc().stream()
                .filter(item -> item.getType() == ItemType.EMOTE && mine.contains(item.getCode()))
                .map(ShopItem::getContentRef)
                .toList();
        return new LoadoutView(
                ref(equipped.get(ItemType.DECK)),
                ref(equipped.get(ItemType.CARD_BACK)),
                ref(equipped.get(ItemType.TABLE)),
                ref(equipped.get(ItemType.FRAME)),
                emotes);
    }

    @Transactional(readOnly = true)
    public CosmeticsView cosmeticsOf(UUID playerId) {
        Map<ItemType, ShopItem> equipped = equipped(playerId);
        return new CosmeticsView(ref(equipped.get(ItemType.CARD_BACK)), ref(equipped.get(ItemType.FRAME)));
    }

    /** The content ref of an emote the player owns, if they do; the table shows it to both players. */
    @Transactional(readOnly = true)
    public Optional<String> ownedEmote(UUID playerId, String code) {
        return items.findById(code)
                .filter(item -> item.getType() == ItemType.EMOTE)
                .filter(item -> item.isDefaultItem() || owned.existsById(new OwnedItem.Key(playerId, code)))
                .map(ShopItem::getContentRef);
    }

    /**
     * Grants every earned item whose bar the player's best streak has reached and that they do not own yet. The
     * streak is read only when something could still be granted, and the insert is idempotent, so a player who
     * already has everything costs nothing extra per visit.
     */
    private void grantEarned(UUID playerId, List<ShopItem> all, Set<String> mine) {
        List<ShopItem> pending = all.stream()
                .filter(ShopItem::isEarned)
                .filter(item -> !mine.contains(item.getCode()))
                .toList();
        if (pending.isEmpty()) {
            return;
        }
        int best = streaks.bestWinStreak(playerId);
        Instant now = clock.instant();
        for (ShopItem item : pending) {
            if (best >= item.getUnlockValue()) {
                owned.grantIfAbsent(playerId, item.getCode(), STREAK_SOURCE, now);
                mine.add(item.getCode());
                log.info("Player {} earned {} with a win streak", playerId, item.getCode());
            }
        }
    }

    private ShopItem require(String code) {
        return items.findById(code).filter(ShopItem::isActive).orElseThrow(() -> new NotFoundException("No such item"));
    }

    private Set<String> ownedCodes(UUID playerId) {
        return owned.findByPlayerId(playerId).stream()
                .map(OwnedItem::getItemCode)
                .collect(Collectors.toSet());
    }

    /** Equipped item per slot, falling back to each slot's default. */
    private Map<ItemType, ShopItem> equipped(UUID playerId) {
        Map<ItemType, ShopItem> result = new EnumMap<>(ItemType.class);
        List<ShopItem> all = items.findByActiveTrueOrderByTypeAscSortOrderAsc();
        all.stream().filter(ShopItem::isDefaultItem).forEach(item -> result.putIfAbsent(item.getType(), item));
        Map<String, ShopItem> byCode = all.stream().collect(Collectors.toMap(ShopItem::getCode, item -> item));
        for (LoadoutSlot slot : loadout.findByPlayerId(playerId)) {
            ShopItem item = byCode.get(slot.getItemCode());
            if (item != null) {
                result.put(slot.getType(), item);
            }
        }
        return result;
    }

    private static ShopItemView view(ShopItem item, Set<String> mine, Map<ItemType, ShopItem> equipped, DropWeek week) {
        boolean isOwned = item.isDefaultItem() || mine.contains(item.getCode());
        ShopItem inSlot = equipped.get(item.getType());
        boolean isEquipped = inSlot != null && inSlot.getCode().equals(item.getCode());
        UnlockView unlock = null;
        Instant availableUntil = null;
        if (item.isEarned()) {
            // Granted the moment the streak is reached, so owning it is the same thing as having met it.
            unlock = new UnlockView(UnlockKind.WIN_STREAK, item.getUnlockValue(), isOwned);
        } else if (item.isDrop()) {
            boolean onSale = week.sells(item.getDropSlot());
            unlock = new UnlockView(UnlockKind.DROP, item.getDropSlot(), onSale);
            availableUntil = onSale ? week.endsAt() : null;
        }
        return new ShopItemView(
                item.getCode(),
                item.getType(),
                item.getContentRef(),
                item.getName(),
                item.getPrice(),
                isOwned,
                isEquipped,
                unlock,
                availableUntil);
    }

    private static String ref(ShopItem item) {
        return item == null ? null : item.getContentRef();
    }

    /** The current drop week: which slot it sells and the instant it ends (next Monday 00:00 in Kyiv). */
    record DropWeek(int slot, Instant endsAt) {

        static DropWeek at(Instant now) {
            ZonedDateTime kyiv = now.atZone(KYIV);
            int week = kyiv.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
            // Through the zone, not "+7 days": a week with a DST change is 167 or 169 hours long.
            Instant nextMonday = kyiv.toLocalDate()
                    .with(TemporalAdjusters.next(DayOfWeek.MONDAY))
                    .atStartOfDay(KYIV)
                    .toInstant();
            return new DropWeek(week % DROP_SLOTS, nextMonday);
        }

        boolean sells(int dropSlot) {
            return dropSlot == slot;
        }
    }
}
