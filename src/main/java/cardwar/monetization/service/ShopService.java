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
import cardwar.monetization.repository.LoadoutSlotRepository;
import cardwar.monetization.repository.OwnedItemRepository;
import cardwar.monetization.repository.ShopItemRepository;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.WalletService;
import java.time.Clock;
import java.util.EnumMap;
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
 */
@Slf4j
@Service
public class ShopService {

    private final ShopItemRepository items;
    private final OwnedItemRepository owned;
    private final LoadoutSlotRepository loadout;
    private final WalletService wallets;
    private final StarsService stars;
    private final Clock clock;

    public ShopService(
            ShopItemRepository items,
            OwnedItemRepository owned,
            LoadoutSlotRepository loadout,
            WalletService wallets,
            StarsService stars,
            Clock clock) {
        this.items = items;
        this.owned = owned;
        this.loadout = loadout;
        this.wallets = wallets;
        this.stars = stars;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ShopView shop(UUID playerId) {
        Set<String> mine = ownedCodes(playerId);
        Map<ItemType, ShopItem> equipped = equipped(playerId);
        List<ShopItemView> views = items.findByActiveTrueOrderByTypeAscSortOrderAsc().stream()
                .map(item -> view(item, mine, equipped))
                .toList();
        return new ShopView(views, stars.packs());
    }

    @Transactional
    public ShopItemView buy(UUID playerId, String code) {
        ShopItem item = require(code);
        if (item.isDefaultItem() || owned.existsById(new OwnedItem.Key(playerId, code))) {
            throw new ConflictException("Already owned", "ALREADY_OWNED");
        }
        wallets.debit(playerId, item.getPrice(), CoinKind.PURCHASE, "item:" + code);
        owned.save(new OwnedItem(playerId, code, "COINS", clock.instant()));
        log.info("Player {} bought {}", playerId, code);
        return view(item, Set.of(code), equipped(playerId));
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

    private static ShopItemView view(ShopItem item, Set<String> mine, Map<ItemType, ShopItem> equipped) {
        boolean isOwned = item.isDefaultItem() || mine.contains(item.getCode());
        ShopItem inSlot = equipped.get(item.getType());
        boolean isEquipped = inSlot != null && inSlot.getCode().equals(item.getCode());
        return new ShopItemView(
                item.getCode(),
                item.getType(),
                item.getContentRef(),
                item.getName(),
                item.getPrice(),
                isOwned,
                isEquipped);
    }

    private static String ref(ShopItem item) {
        return item == null ? null : item.getContentRef();
    }
}
