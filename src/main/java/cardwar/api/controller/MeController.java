package cardwar.api.controller;

import cardwar.account.dto.ProgressView;
import cardwar.account.service.AccountService;
import cardwar.api.dto.MeView;
import cardwar.monetization.service.EntitlementService;
import cardwar.security.PlayerIdentity;
import cardwar.session.dto.DuelHistoryEntry;
import cardwar.session.service.DuelHistoryService;
import cardwar.wallet.dto.MissionView;
import cardwar.wallet.dto.WalletView;
import cardwar.wallet.service.MissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The caller's own profile, assembled from the account and monetization modules. The identity comes from the
 * verified token, never from a path variable, so there is no id here for a caller to swap for somebody else's.
 */
@RestController
@RequestMapping("/api/v1/me")
@Tag(name = "Profile", description = "The authenticated player's own account")
public class MeController {

    private final AccountService accounts;
    private final EntitlementService entitlements;
    private final DuelHistoryService history;
    private final MissionService missions;

    public MeController(
            AccountService accounts,
            EntitlementService entitlements,
            DuelHistoryService history,
            MissionService missions) {
        this.accounts = accounts;
        this.entitlements = entitlements;
        this.history = history;
        this.missions = missions;
    }

    @GetMapping
    @Operation(summary = "Profile, progress and collection for the authenticated player")
    public MeView me(@AuthenticationPrincipal PlayerIdentity caller) {
        return new MeView(
                accounts.summary(caller.playerId()),
                accounts.progressOf(caller.playerId()),
                entitlements.collection(caller.playerId()));
    }

    @GetMapping("/progress")
    @Operation(summary = "Win streak, best streak, XP, rank and the bonus the next staked win pays")
    public ProgressView progress(@AuthenticationPrincipal PlayerIdentity caller) {
        return accounts.progressOf(caller.playerId());
    }

    @GetMapping("/missions")
    @Operation(summary = "Today's three missions with the caller's progress and whether each reward was claimed")
    public List<MissionView> missions(@AuthenticationPrincipal PlayerIdentity caller) {
        return missions.missionsOf(caller.playerId());
    }

    @PostMapping("/missions/{code}/claim")
    @Operation(
            summary = "Collect a completed mission's coins; 400 MISSION_INCOMPLETE, 409 ALREADY_CLAIMED, 404 unknown")
    public WalletView claimMission(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable String code) {
        return missions.claim(caller.playerId(), code);
    }

    @GetMapping("/duels")
    @Operation(summary = "The authenticated player's finished duels, newest first, at most 50")
    public List<DuelHistoryEntry> duels(@AuthenticationPrincipal PlayerIdentity caller) {
        return history.historyOf(caller.playerId());
    }
}
