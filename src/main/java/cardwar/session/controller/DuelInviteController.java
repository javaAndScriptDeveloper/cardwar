package cardwar.session.controller;

import cardwar.engine.PlayerId;
import cardwar.security.PlayerIdentity;
import cardwar.session.dto.DuelView;
import cardwar.session.dto.InviteView;
import cardwar.session.service.DuelInviteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Invites: how a duel starts from a shared link rather than from knowing the opponent's username. */
@RestController
@RequestMapping("/api/v1/duels/invites")
@Tag(name = "Invites", description = "Create, share and accept a duel invite")
public class DuelInviteController {

    private final DuelInviteService invites;

    public DuelInviteController(DuelInviteService invites) {
        this.invites = invites;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an invite to share; anyone who accepts it plays the caller")
    public InviteView create(@AuthenticationPrincipal PlayerIdentity caller) {
        return invites.create(actor(caller));
    }

    @GetMapping("/pending")
    @Operation(summary = "The caller's invite nobody has accepted yet (200), or 204 when there is none")
    public ResponseEntity<InviteView> pending(@AuthenticationPrincipal PlayerIdentity caller) {
        return invites.pending(actor(caller)).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent()
                .build());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Invite status; names the duel once accepted. The creator polls this while waiting")
    public InviteView status(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable String id) {
        return invites.status(actor(caller), id);
    }

    @PostMapping("/{id}/accept")
    @Operation(summary = "Accept an invite and start the duel; returns the acceptor's view")
    public DuelView accept(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable String id) {
        return invites.accept(actor(caller), id);
    }

    private static PlayerId actor(PlayerIdentity caller) {
        return new PlayerId(caller.playerId());
    }
}
