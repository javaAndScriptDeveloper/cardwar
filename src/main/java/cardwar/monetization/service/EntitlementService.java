package cardwar.monetization.service;

import cardwar.account.service.AccountService;
import cardwar.catalog.service.CatalogService;
import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.exception.NotFoundException;
import cardwar.exception.NotImplementedException;
import cardwar.monetization.domain.Entitlement;
import cardwar.monetization.domain.UnlockRule;
import cardwar.monetization.dto.CollectionView;
import cardwar.monetization.dto.LockedItemView;
import cardwar.monetization.dto.OwnedItemView;
import cardwar.monetization.dto.TargetType;
import cardwar.monetization.dto.UnlockRuleView;
import cardwar.monetization.dto.UnlockType;
import cardwar.monetization.grant.EntitlementGrantSource;
import cardwar.monetization.grant.GrantDecision;
import cardwar.monetization.grant.UnlockContext;
import cardwar.monetization.repository.EntitlementRepository;
import cardwar.monetization.repository.UnlockRuleRepository;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ownership of cosmetic targets. Every unlock decision comes from a row in {@code unlock_rule} evaluated by the
 * grant source registered for its type, so pricing and thresholds are edited as data and this class never grows
 * a branch per skin.
 */
@Slf4j
@Service
public class EntitlementService {

    private final EntitlementRepository entitlements;
    private final UnlockRuleRepository rules;
    private final CatalogService catalog;
    private final AccountService accounts;
    private final Map<UnlockType, EntitlementGrantSource> grantSources;

    public EntitlementService(
            EntitlementRepository entitlements,
            UnlockRuleRepository rules,
            CatalogService catalog,
            AccountService accounts,
            List<EntitlementGrantSource> grantSources) {
        this.entitlements = entitlements;
        this.rules = rules;
        this.catalog = catalog;
        this.accounts = accounts;
        this.grantSources = index(grantSources);
    }

    /**
     * Exactly one source per rule type, resolved at startup. A missing or duplicated handler is a wiring mistake
     * that would otherwise surface as a runtime 500 on somebody's purchase.
     */
    private static Map<UnlockType, EntitlementGrantSource> index(List<EntitlementGrantSource> sources) {
        Map<UnlockType, EntitlementGrantSource> byType = new EnumMap<>(UnlockType.class);
        for (EntitlementGrantSource source : sources) {
            EntitlementGrantSource previous = byType.put(source.supports(), source);
            if (previous != null) {
                throw new IllegalStateException("Two grant sources claim " + source.supports());
            }
        }
        for (UnlockType type : UnlockType.values()) {
            if (!byType.containsKey(type)) {
                throw new IllegalStateException("No grant source handles " + type);
            }
        }
        return byType;
    }

    @Transactional(readOnly = true)
    public boolean owns(UUID playerId, TargetType targetType, UUID targetId) {
        Instant now = Instant.now();
        return entitlements
                .findByPlayerIdAndTargetTypeAndTargetId(playerId, targetType, targetId)
                .filter(entitlement -> entitlement.isActiveAt(now))
                .isPresent();
    }

    @Transactional(readOnly = true)
    public List<OwnedItemView> ownedBy(UUID playerId) {
        Instant now = Instant.now();
        return entitlements.findAllByPlayerId(playerId).stream()
                .filter(entitlement -> entitlement.isActiveAt(now))
                .map(this::toOwnedView)
                .toList();
    }

    /**
     * Owned targets plus everything else that has an unlock rule, each with the rule that would open it. A target
     * with no rule is not offered at all — that is how something stays unreleased without a feature flag.
     */
    @Transactional(readOnly = true)
    public CollectionView collection(UUID playerId) {
        List<OwnedItemView> owned = ownedBy(playerId);
        Map<UUID, OwnedItemView> ownedByTarget =
                owned.stream().collect(Collectors.toMap(OwnedItemView::targetId, Function.identity()));
        List<LockedItemView> locked = rules.findAll().stream()
                .filter(rule -> !ownedByTarget.containsKey(rule.getTargetId()))
                .map(this::toLockedView)
                .flatMap(Optional::stream)
                .toList();
        return new CollectionView(owned, locked);
    }

    @Transactional
    public OwnedItemView unlockSkin(UUID playerId, String code) {
        return unlock(playerId, TargetType.SKIN, catalog.skinByCode(code).id());
    }

    @Transactional
    public OwnedItemView unlockTheme(UUID playerId, String code) {
        return unlock(
                playerId, TargetType.THEME, catalog.themeByCode(code).theme().id());
    }

    /**
     * Runs the target's rule and, if it passes, records ownership. The currency deduction happens inside this
     * transaction so that a player is never charged for an entitlement that failed to insert.
     *
     * <p>An unmet rule is a 400, not a 403: the player is allowed to try, the request is simply not satisfiable
     * yet. 403 is reserved for acting on somebody else's resources.
     */
    @Transactional
    public OwnedItemView unlock(UUID playerId, TargetType targetType, UUID targetId) {
        if (owns(playerId, targetType, targetId)) {
            throw new ConflictException("Already unlocked");
        }
        UnlockRule rule = rules.findByTargetTypeAndTargetId(targetType, targetId)
                .orElseThrow(() -> new NotFoundException("This item cannot be unlocked"));
        var progress = accounts.progressOf(playerId);
        var context = new UnlockContext(playerId, toView(rule), progress.duelsWon(), progress.currencyBalance());

        GrantDecision decision = grantSources.get(rule.getRuleType()).evaluate(context);
        GrantDecision.Granted granted =
                switch (decision) {
                    case GrantDecision.Granted g -> g;
                    case GrantDecision.Rejected r -> throw new BadRequestException(r.reason());
                    case GrantDecision.Unavailable u -> throw new NotImplementedException(u.reason());
                };

        if (granted.currencySpent() > 0) {
            accounts.spendCurrency(playerId, granted.currencySpent());
        }
        Instant now = Instant.now();
        // The table allows one row per (player, target). If one exists here it is necessarily expired — owns()
        // said no — so the grant refreshes it in place; inserting would only trip the unique constraint and
        // lock the player out of a target they no longer own.
        var entitlement = entitlements
                .findByPlayerIdAndTargetTypeAndTargetId(playerId, targetType, targetId)
                .map(expired -> {
                    expired.setSource(granted.source());
                    expired.setGrantedAt(now);
                    expired.setExpiresAt(null);
                    return expired;
                })
                .orElseGet(() ->
                        new Entitlement(UUID.randomUUID(), playerId, targetType, targetId, granted.source(), now));
        try {
            entitlements.saveAndFlush(entitlement);
        } catch (DataIntegrityViolationException raced) {
            // Two unlock requests in flight for the same target: the unique constraint decides, and the losing
            // transaction rolls back — including any deduction it made.
            throw new ConflictException("Already unlocked");
        }
        log.info("Granted {} {} to player {} via {}", targetType, targetId, playerId, granted.source());
        return toOwnedView(entitlement);
    }

    private OwnedItemView toOwnedView(Entitlement entitlement) {
        Target target = describe(entitlement.getTargetType(), entitlement.getTargetId())
                .orElseGet(() -> new Target("UNKNOWN", "Unknown item"));
        return new OwnedItemView(
                entitlement.getTargetType(),
                entitlement.getTargetId(),
                target.code(),
                target.displayName(),
                entitlement.getSource(),
                entitlement.getGrantedAt(),
                entitlement.getExpiresAt());
    }

    /** A rule pointing at a target the catalog no longer serves is skipped rather than shown as a broken row. */
    private Optional<LockedItemView> toLockedView(UnlockRule rule) {
        return describe(rule.getTargetType(), rule.getTargetId())
                .map(target -> new LockedItemView(
                        rule.getTargetType(), rule.getTargetId(), target.code(), target.displayName(), toView(rule)));
    }

    private Optional<Target> describe(TargetType targetType, UUID targetId) {
        try {
            return Optional.of(
                    switch (targetType) {
                        case SKIN -> {
                            var skin = catalog.skinById(targetId);
                            yield new Target(skin.code(), skin.displayName());
                        }
                        case THEME -> {
                            var theme = catalog.themeById(targetId);
                            yield new Target(theme.code(), theme.name());
                        }
                    });
        } catch (NotFoundException missing) {
            return Optional.empty();
        }
    }

    private static UnlockRuleView toView(UnlockRule rule) {
        return new UnlockRuleView(
                rule.getTargetType(),
                rule.getTargetId(),
                rule.getRuleType(),
                rule.getThreshold(),
                rule.getPrice(),
                rule.getCurrency());
    }

    private record Target(String code, String displayName) {}
}
