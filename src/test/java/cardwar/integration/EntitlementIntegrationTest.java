package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.account.service.AccountService;
import cardwar.monetization.domain.Entitlement;
import cardwar.monetization.dto.EntitlementSource;
import cardwar.monetization.dto.TargetType;
import cardwar.monetization.repository.EntitlementRepository;
import cardwar.monetization.service.EntitlementService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * Every unlock rule type the seed ships, exercised through the API by a freshly registered player. The seed is the
 * fixture: CLASSIC is free, VANGUARD needs ten wins, the Ironvale Sovereign costs 500 coins and the Emberhold
 * Sovereign is a real-money purchase that is not open yet.
 */
class EntitlementIntegrationTest extends AbstractIntegrationTest {

    private static final UUID VANGUARD_THEME_ID = UUID.fromString("a6f01eaf-0a83-5f44-a5e9-7733d81b6236");
    private static final UUID VANGUARD_ACE_CLUBS_ID = UUID.fromString("5792ee0e-6ff4-5f94-bfed-195d9179d6e2");
    private static final String CURRENCY_SKIN = "VANGUARD_ACE_SPADES";
    private static final String PURCHASE_SKIN = "VANGUARD_ACE_DIAMONDS";

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    AccountService accounts;

    @Autowired
    EntitlementService entitlementService;

    @Autowired
    EntitlementRepository entitlements;

    ApiDriver api;
    ApiDriver.Player player;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        player = api.register(ApiDriver.uniqueUsername("own"));
    }

    @Test
    void freeThemeIsGrantedOnRequestWithTheFreeSourceRecorded() throws Exception {
        api.unlockTheme(player, "CLASSIC")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetType").value("THEME"))
                .andExpect(jsonPath("$.code").value("CLASSIC"))
                .andExpect(jsonPath("$.source").value("FREE"))
                .andExpect(jsonPath("$.grantedAt").isString());

        api.collection(player)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.owned[?(@.code == 'CLASSIC')].source").value("FREE"));
    }

    @Test
    void duplicateGrantIsA409AndCreatesNoSecondRow() throws Exception {
        api.unlockTheme(player, "CLASSIC").andExpect(status().isOk());

        api.unlockTheme(player, "CLASSIC").andExpect(status().isConflict());

        assertThat(entitlements.findAllByPlayerId(player.id())).hasSize(1);
    }

    @Test
    void progressUnlockBelowThresholdIsA400ProblemDetailAndGrantsNothing() throws Exception {
        api.unlockTheme(player, "VANGUARD")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").isString());

        assertThat(entitlements.findAllByPlayerId(player.id())).isEmpty();
    }

    @Test
    void progressUnlockAtThresholdIsGrantedWithTheProgressSource() throws Exception {
        for (int win = 0; win < 10; win++) {
            accounts.recordDuelPlayed(player.id(), true);
        }

        api.unlockTheme(player, "VANGUARD")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("PROGRESS"))
                .andExpect(jsonPath("$.targetId").value(VANGUARD_THEME_ID.toString()));
    }

    @Test
    void currencyUnlockWithInsufficientBalanceIsRejectedAndTheBalanceIsUnchanged() throws Exception {
        accounts.creditCurrency(player.id(), 100);

        api.unlockSkin(player, CURRENCY_SKIN).andExpect(status().isBadRequest());

        assertThat(entitlements.findAllByPlayerId(player.id())).isEmpty();
        api.me(player).andExpect(jsonPath("$.progress.currencyBalance").value(100));
    }

    @Test
    void currencyUnlockDeductsThePriceAndRecordsTheCurrencySource() throws Exception {
        accounts.creditCurrency(player.id(), 700);

        api.unlockSkin(player, CURRENCY_SKIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("CURRENCY"))
                .andExpect(jsonPath("$.code").value(CURRENCY_SKIN));

        api.me(player).andExpect(jsonPath("$.progress.currencyBalance").value(200));
    }

    @Test
    void purchaseUnlockReportsTheCapabilityAsUnavailable() throws Exception {
        api.unlockSkin(player, PURCHASE_SKIN)
                .andExpect(status().isNotImplemented())
                .andExpect(jsonPath("$.status").value(501));

        assertThat(entitlements.findAllByPlayerId(player.id())).isEmpty();
    }

    @Test
    void targetWithoutARuleCannotBeUnlocked() throws Exception {
        api.unlockSkin(player, "VANGUARD_ACE_CLUBS").andExpect(status().isNotFound());

        assertThat(entitlements.findAllByPlayerId(player.id())).isEmpty();
    }

    @Test
    void expiredEntitlementIsNotOwnership() throws Exception {
        var expired = new Entitlement(
                UUID.randomUUID(),
                player.id(),
                TargetType.SKIN,
                VANGUARD_ACE_CLUBS_ID,
                EntitlementSource.FREE,
                Instant.now().minusSeconds(7200));
        expired.setExpiresAt(Instant.now().minusSeconds(3600));
        entitlements.saveAndFlush(expired);

        assertThat(entitlementService.owns(player.id(), TargetType.SKIN, VANGUARD_ACE_CLUBS_ID))
                .isFalse();
        var body = api.readBody(api.collection(player).andExpect(status().isOk()));
        @SuppressWarnings("unchecked")
        var owned = (List<Map<String, Object>>) body.get("owned");
        assertThat(owned).extracting(row -> row.get("targetId")).doesNotContain(VANGUARD_ACE_CLUBS_ID.toString());
    }

    @Test
    void lockedTargetsReportTheirUnlockPath() throws Exception {
        api.collection(player)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locked[?(@.code == 'VANGUARD')].unlockRule.ruleType")
                        .value("PROGRESS"))
                .andExpect(jsonPath("$.locked[?(@.code == 'VANGUARD')].unlockRule.threshold")
                        .value(10))
                .andExpect(jsonPath("$.locked[?(@.code == '" + CURRENCY_SKIN + "')].unlockRule.price")
                        .value(500));
    }
}
