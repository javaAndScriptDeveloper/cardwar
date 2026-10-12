package cardwar.session.controller;

import cardwar.engine.PlayerId;
import cardwar.security.PlayerIdentity;
import cardwar.session.dto.EnterMatchmakingRequest;
import cardwar.session.dto.MatchView;
import cardwar.session.service.MatchmakingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/matchmaking")
@Tag(name = "Quick match", description = "Find an opponent at a stake table")
public class MatchmakingController {

    private final MatchmakingService matchmaking;

    public MatchmakingController(MatchmakingService matchmaking) {
        this.matchmaking = matchmaking;
    }

    @PostMapping
    @Operation(summary = "Join the queue at a stake table; pairs at once if somebody is waiting there")
    public MatchView enter(
            @AuthenticationPrincipal PlayerIdentity caller, @Valid @RequestBody EnterMatchmakingRequest request) {
        return matchmaking.enter(new PlayerId(caller.playerId()), request.stake());
    }

    @GetMapping
    @Operation(summary = "The caller's place in the queue: WAITING, MATCHED (with the duel, reported once) or EXPIRED")
    public ResponseEntity<MatchView> status(@AuthenticationPrincipal PlayerIdentity caller) {
        return matchmaking
                .status(new PlayerId(caller.playerId()))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Leave the queue")
    public void leave(@AuthenticationPrincipal PlayerIdentity caller) {
        matchmaking.leave(new PlayerId(caller.playerId()));
    }
}
