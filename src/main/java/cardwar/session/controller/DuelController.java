package cardwar.session.controller;

import cardwar.engine.DuelId;
import cardwar.engine.PlayerId;
import cardwar.security.PlayerIdentity;
import cardwar.session.dto.CreateDuelRequest;
import cardwar.session.dto.DuelSummary;
import cardwar.session.dto.DuelView;
import cardwar.session.dto.EmoteRequest;
import cardwar.session.dto.MoveRequest;
import cardwar.session.event.DuelStreams;
import cardwar.session.service.DuelService;
import cardwar.session.service.EmoteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * The REST face of a duel. It maps payloads and delegates; every rule — participation, legality, redaction —
 * is enforced further in, so a second transport gets the same guarantees for free.
 */
@RestController
@RequestMapping("/api/v1/duels")
@Tag(name = "Duels", description = "Creating, reading and playing duels")
public class DuelController {

    private final DuelService duels;
    private final DuelStreams streams;
    private final EmoteService emotes;

    public DuelController(DuelService duels, DuelStreams streams, EmoteService emotes) {
        this.duels = duels;
        this.streams = streams;
        this.emotes = emotes;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Start a duel against another registered player")
    public DuelView create(
            @AuthenticationPrincipal PlayerIdentity caller, @Valid @RequestBody CreateDuelRequest request) {
        return duels.create(actor(caller), request.opponentUsername());
    }

    @GetMapping("/active")
    @Operation(summary = "The caller's in-progress duels, so a reopened client can return to the table")
    public List<DuelSummary> active(@AuthenticationPrincipal PlayerIdentity caller) {
        return duels.active(actor(caller));
    }

    @GetMapping("/{id}")
    @Operation(summary = "The caller's redacted view of a duel")
    public DuelView view(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable UUID id) {
        return duels.viewFor(id, actor(caller));
    }

    @PostMapping("/{id}/moves")
    @Operation(summary = "Submit a move; the engine re-validates it against the stored state")
    public DuelView move(
            @AuthenticationPrincipal PlayerIdentity caller,
            @PathVariable UUID id,
            @Valid @RequestBody MoveRequest request) {
        return duels.applyCommand(id, actor(caller), request.toCommand());
    }

    @PostMapping("/{id}/emotes")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Throw an owned emote at the table; both players see it on the event stream")
    public void emote(
            @AuthenticationPrincipal PlayerIdentity caller,
            @PathVariable UUID id,
            @Valid @RequestBody EmoteRequest request) {
        emotes.send(id, actor(caller), request.code());
    }

    @GetMapping(value = "/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Live event stream for a duel, so the opponent's moves arrive without polling")
    public SseEmitter events(@AuthenticationPrincipal PlayerIdentity caller, @PathVariable UUID id) {
        DuelId duelId = duels.requireParticipant(id, actor(caller));
        return streams.open(duelId, caller.playerId());
    }

    private static PlayerId actor(PlayerIdentity caller) {
        return new PlayerId(caller.playerId());
    }
}
