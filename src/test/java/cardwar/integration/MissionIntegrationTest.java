package cardwar.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.session.service.DuelCompletionService;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.dto.MissionView;
import cardwar.wallet.service.MissionService;
import cardwar.wallet.service.WalletService;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.ObjectMapper;

/** Three missions a day, the same for everyone: progress comes from finished duels, the reward from one claim. */
class MissionIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    DuelCompletionService completion;

    @Autowired
    WalletService wallets;

    @Autowired
    MissionService missions;

    ApiDriver api;
    ApiDriver.Player alice;
    ApiDriver.Player bob;
    FinishedDuels duels;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
        bob = api.register(ApiDriver.uniqueUsername("bob"));
        duels = new FinishedDuels(completion, wallets);
    }

    private ResultActions list(ApiDriver.Player player) throws Exception {
        return mvc.perform(get("/api/v1/me/missions").headers(api.bearer(player)));
    }

    private ResultActions claim(ApiDriver.Player player, String code) throws Exception {
        return mvc.perform(post("/api/v1/me/missions/{code}/claim", code).headers(api.bearer(player)));
    }

    @Test
    void theThreeMissionsStartAtZeroAndMoveAsDuelsFinish() throws Exception {
        list(alice)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].code").value("PLAY_3"))
                .andExpect(jsonPath("$[0].target").value(3))
                .andExpect(jsonPath("$[0].reward").value(60))
                .andExpect(jsonPath("$[0].progress").value(0))
                .andExpect(jsonPath("$[0].claimed").value(false))
                .andExpect(jsonPath("$[1].code").value("WIN_2"))
                .andExpect(jsonPath("$[1].target").value(2))
                .andExpect(jsonPath("$[1].reward").value(120))
                .andExpect(jsonPath("$[2].code").value("STAKED_WIN_1"))
                .andExpect(jsonPath("$[2].target").value(1))
                .andExpect(jsonPath("$[2].reward").value(150));

        duels.won(alice, bob, 0);
        list(alice)
                .andExpect(jsonPath("$[0].progress").value(1))
                .andExpect(jsonPath("$[1].progress").value(1))
                .andExpect(jsonPath("$[2].progress").value(0));
        list(bob)
                .andExpect(jsonPath("$[0].progress").value(1))
                .andExpect(jsonPath("$[1].progress").value(0));

        // A draw is a duel played, not a duel won.
        duels.drawn(alice, bob, 0);
        list(alice)
                .andExpect(jsonPath("$[0].progress").value(2))
                .andExpect(jsonPath("$[1].progress").value(1));

        duels.won(alice, bob, 100);
        list(alice)
                .andExpect(jsonPath("$[0].progress").value(3))
                .andExpect(jsonPath("$[1].progress").value(2))
                .andExpect(jsonPath("$[2].progress").value(1));

        // Progress stops at the target.
        duels.won(alice, bob, 0);
        list(alice)
                .andExpect(jsonPath("$[0].progress").value(3))
                .andExpect(jsonPath("$[1].progress").value(2));
    }

    @Test
    void aClaimPaysOnceAndAnIncompleteMissionIsRefused() throws Exception {
        claim(alice, "PLAY_3")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.reason").value("MISSION_INCOMPLETE"));
        claim(alice, "NOPE").andExpect(status().isNotFound());

        for (int i = 0; i < 3; i++) {
            duels.won(alice, bob, 0);
        }

        claim(alice, "PLAY_3")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balance").value(560))
                .andExpect(jsonPath("$.dailyBonus.available").exists());
        claim(alice, "PLAY_3")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.reason").value("ALREADY_CLAIMED"));
        list(alice)
                .andExpect(jsonPath("$[0].claimed").value(true))
                .andExpect(jsonPath("$[1].claimed").value(false));
        assertThat(wallets.balance(alice.id())).isEqualTo(560);
        assertThat(wallets.transactions(alice.id()).stream()
                        .filter(row -> row.kind() == CoinKind.MISSION_REWARD)
                        .count())
                .isEqualTo(1);
        // Bob played the same three duels but won none of them.
        claim(bob, "WIN_2").andExpect(status().isBadRequest());
    }

    @Test
    void aNewKyivDayStartsEveryMissionOver() {
        LocalDate day = LocalDate.of(2027, 2, 1);
        missions.recordOn(alice.id(), day, true, 100);
        missions.recordOn(alice.id(), day, true, 0);

        assertThat(missions.missionsOn(alice.id(), day))
                .extracting(MissionView::code, MissionView::progress)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("PLAY_3", 2),
                        org.assertj.core.groups.Tuple.tuple("WIN_2", 2),
                        org.assertj.core.groups.Tuple.tuple("STAKED_WIN_1", 1));
        assertThat(missions.missionsOn(alice.id(), day.plusDays(1)))
                .extracting(MissionView::progress)
                .containsExactly(0, 0, 0);

        assertThatThrownBy(() -> missions.claimOn(alice.id(), day.plusDays(1), "WIN_2"))
                .isInstanceOf(BadRequestException.class);
        assertThat(missions.claimOn(alice.id(), day, "WIN_2").claimed()).isTrue();
        assertThatThrownBy(() -> missions.claimOn(alice.id(), day, "WIN_2")).isInstanceOf(ConflictException.class);
        assertThat(wallets.balance(alice.id())).isEqualTo(620);
        assertThat(List.of(missions.missionsOn(alice.id(), day).get(1).claimed()))
                .containsExactly(true);
    }
}
