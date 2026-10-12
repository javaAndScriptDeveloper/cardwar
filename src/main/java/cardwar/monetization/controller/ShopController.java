package cardwar.monetization.controller;

import cardwar.monetization.dto.InvoiceRequest;
import cardwar.monetization.dto.InvoiceView;
import cardwar.monetization.dto.LoadoutView;
import cardwar.monetization.dto.ShopItemView;
import cardwar.monetization.dto.ShopView;
import cardwar.monetization.service.ShopService;
import cardwar.monetization.service.StarsService;
import cardwar.security.PlayerIdentity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Shop", description = "Cosmetics for coins, the loadout, and coin packs for Telegram Stars")
public class ShopController {

    private final ShopService shop;
    private final StarsService stars;

    public ShopController(ShopService shop, StarsService stars) {
        this.shop = shop;
        this.stars = stars;
    }

    @GetMapping("/api/v1/shop")
    @Operation(summary = "Every cosmetic with the caller's ownership and equipped state, and the coin packs")
    public ShopView shop(@AuthenticationPrincipal PlayerIdentity caller) {
        return shop.shop(caller.playerId());
    }

    @PostMapping("/api/v1/shop/items/{code}/buy")
    @Operation(summary = "Buy a cosmetic for coins (400 INSUFFICIENT_COINS, 409 ALREADY_OWNED)")
    public ShopItemView buy(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable String code) {
        return shop.buy(caller.playerId(), code);
    }

    @PostMapping("/api/v1/shop/items/{code}/equip")
    @Operation(summary = "Equip an owned cosmetic (400 NOT_OWNED, 400 NOT_EQUIPPABLE for emotes)")
    public LoadoutView equip(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable String code) {
        return shop.equip(caller.playerId(), code);
    }

    @GetMapping("/api/v1/me/loadout")
    @Operation(summary = "What the caller has equipped, and the emotes they own")
    public LoadoutView loadout(@AuthenticationPrincipal PlayerIdentity caller) {
        return shop.loadoutOf(caller.playerId());
    }

    @PostMapping("/api/v1/shop/stars/invoice")
    @Operation(summary = "A Telegram Stars invoice link for a coin pack (503 PAYMENTS_UNAVAILABLE)")
    public InvoiceView invoice(
            @AuthenticationPrincipal PlayerIdentity caller, @Valid @RequestBody InvoiceRequest request) {
        return stars.invoice(caller.playerId(), request.packId());
    }
}
