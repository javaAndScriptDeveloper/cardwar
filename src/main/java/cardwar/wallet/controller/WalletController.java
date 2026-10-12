package cardwar.wallet.controller;

import cardwar.security.PlayerIdentity;
import cardwar.wallet.dto.CoinTransactionView;
import cardwar.wallet.dto.WalletView;
import cardwar.wallet.service.DailyBonusService;
import cardwar.wallet.service.WalletService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/wallet")
@Tag(name = "Wallet", description = "Coins, the ledger and the daily bonus")
public class WalletController {

    private final WalletService wallets;
    private final DailyBonusService bonuses;

    public WalletController(WalletService wallets, DailyBonusService bonuses) {
        this.wallets = wallets;
        this.bonuses = bonuses;
    }

    @GetMapping
    @Operation(summary = "The caller's balance and today's bonus")
    public WalletView wallet(@AuthenticationPrincipal PlayerIdentity caller) {
        return bonuses.view(caller.playerId());
    }

    @PostMapping("/daily-bonus")
    @Operation(summary = "Claim today's bonus; 409 BONUS_ALREADY_CLAIMED when it was claimed already")
    public WalletView claim(@AuthenticationPrincipal PlayerIdentity caller) {
        return bonuses.claim(caller.playerId());
    }

    @GetMapping("/transactions")
    @Operation(summary = "The caller's latest 50 coin movements, newest first")
    public List<CoinTransactionView> transactions(@AuthenticationPrincipal PlayerIdentity caller) {
        return wallets.transactions(caller.playerId());
    }
}
