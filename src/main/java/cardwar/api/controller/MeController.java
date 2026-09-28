package cardwar.api.controller;

import cardwar.account.service.AccountService;
import cardwar.api.dto.MeView;
import cardwar.monetization.service.EntitlementService;
import cardwar.security.PlayerIdentity;
import cardwar.session.dto.DuelHistoryEntry;
import cardwar.session.service.DuelHistoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
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

    public MeController(AccountService accounts, EntitlementService entitlements, DuelHistoryService history) {
        this.accounts = accounts;
        this.entitlements = entitlements;
        this.history = history;
    }

    @GetMapping
    @Operation(summary = "Profile, progress and collection for the authenticated player")
    public MeView me(@AuthenticationPrincipal PlayerIdentity caller) {
        return new MeView(
                accounts.summary(caller.playerId()),
                accounts.progressOf(caller.playerId()),
                entitlements.collection(caller.playerId()));
    }

    @GetMapping("/duels")
    @Operation(summary = "The authenticated player's finished duels, newest first, at most 50")
    public List<DuelHistoryEntry> duels(@AuthenticationPrincipal PlayerIdentity caller) {
        return history.historyOf(caller.playerId());
    }
}
