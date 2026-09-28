package cardwar.monetization.controller;

import cardwar.monetization.dto.CollectionView;
import cardwar.monetization.dto.OwnedItemView;
import cardwar.monetization.service.EntitlementService;
import cardwar.security.PlayerIdentity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unlocks act on the authenticated player only — the player id is never read from the path or the body, so
 * there is nothing here for a caller to forge.
 */
@RestController
@RequestMapping("/api/v1")
@Validated
@Tag(name = "Collection", description = "Owning and unlocking skins and themes")
public class EntitlementController {

    private final EntitlementService entitlements;

    public EntitlementController(EntitlementService entitlements) {
        this.entitlements = entitlements;
    }

    @GetMapping("/collection")
    @Operation(summary = "What the caller owns, and how everything else can be unlocked")
    public CollectionView collection(@AuthenticationPrincipal PlayerIdentity caller) {
        return entitlements.collection(caller.playerId());
    }

    @PostMapping("/skins/{code}/unlock")
    @Operation(summary = "Run the unlock rule for a card skin")
    public OwnedItemView unlockSkin(
            @AuthenticationPrincipal PlayerIdentity caller, @PathVariable @NotBlank @Size(max = 64) String code) {
        return entitlements.unlockSkin(caller.playerId(), code);
    }

    @PostMapping("/themes/{code}/unlock")
    @Operation(summary = "Run the unlock rule for a whole deck theme")
    public OwnedItemView unlockTheme(
            @AuthenticationPrincipal PlayerIdentity caller, @PathVariable @NotBlank @Size(max = 64) String code) {
        return entitlements.unlockTheme(caller.playerId(), code);
    }
}
