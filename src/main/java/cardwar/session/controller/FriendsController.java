package cardwar.session.controller;

import cardwar.engine.PlayerId;
import cardwar.security.PlayerIdentity;
import cardwar.session.dto.ChallengeRequest;
import cardwar.session.dto.ChallengeView;
import cardwar.session.dto.FriendView;
import cardwar.session.dto.InviteView;
import cardwar.session.dto.LeaderboardEntry;
import cardwar.session.dto.OutgoingChallengeView;
import cardwar.session.service.FriendsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Friends", description = "People you played, challenges to them and from them")
public class FriendsController {

    private final FriendsService friends;

    public FriendsController(FriendsService friends) {
        this.friends = friends;
    }

    @GetMapping("/api/v1/friends")
    @Operation(summary = "Everybody the caller has finished a duel against, most recent first, with the record")
    public List<FriendView> friends(@AuthenticationPrincipal PlayerIdentity caller) {
        return friends.friendsOf(new PlayerId(caller.playerId()));
    }

    @GetMapping("/api/v1/friends/leaderboard")
    @Operation(summary = "You and your friends ranked by coins won in the last 7 days, then wins; at most 20")
    public List<LeaderboardEntry> leaderboard(@AuthenticationPrincipal PlayerIdentity caller) {
        return friends.leaderboard(new PlayerId(caller.playerId()));
    }

    @PostMapping("/api/v1/friends/{playerId}/challenge")
    @Operation(summary = "Challenge a friend at a stake; only they can accept, and the bot tells them")
    public InviteView challenge(
            @AuthenticationPrincipal PlayerIdentity caller,
            @PathVariable UUID playerId,
            @RequestBody(required = false) ChallengeRequest request) {
        return friends.challenge(
                new PlayerId(caller.playerId()), playerId, request == null ? 0 : request.stakeOrZero());
    }

    @GetMapping("/api/v1/challenges")
    @Operation(summary = "Challenges addressed to the caller that are still open")
    public List<ChallengeView> challenges(@AuthenticationPrincipal PlayerIdentity caller) {
        return friends.incoming(new PlayerId(caller.playerId()));
    }

    @GetMapping("/api/v1/challenges/outgoing")
    @Operation(summary = "Challenges the caller sent in the last day, newest first, at most 20, with their status")
    public List<OutgoingChallengeView> outgoing(@AuthenticationPrincipal PlayerIdentity caller) {
        return friends.outgoing(new PlayerId(caller.playerId()));
    }
}
