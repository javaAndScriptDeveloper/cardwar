package cardwar.session.service;

import cardwar.account.service.AccountService;
import cardwar.bot.service.TelegramBotService;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.session.dto.ChallengeView;
import cardwar.session.dto.FriendView;
import cardwar.session.dto.InviteView;
import cardwar.session.dto.LeaderboardEntry;
import cardwar.session.dto.OutgoingChallengeView;
import cardwar.session.dto.PlayerProfileView;
import cardwar.session.policy.ChallengeCooldown;
import cardwar.session.repository.DuelResultRepository;
import cardwar.session.repository.DuelResultRepository.WinTotals;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Friends are derived from finished duels, never stored: anyone you played is a friend. Challenging one is an
 * invite only they can accept, and the bot tells them about it in Telegram.
 */
@Slf4j
@Service
public class FriendsService {

    static final Duration LEADERBOARD_WINDOW = Duration.ofDays(7);
    static final int LEADERBOARD_SIZE = 20;

    private final DuelResultRepository results;
    private final AccountService accounts;
    private final DuelInviteService invites;
    private final TelegramBotService bot;
    private final ChallengeCooldown cooldown;
    private final Clock clock;

    public FriendsService(
            DuelResultRepository results,
            AccountService accounts,
            DuelInviteService invites,
            TelegramBotService bot,
            Clock clock) {
        this.results = results;
        this.accounts = accounts;
        this.invites = invites;
        this.bot = bot;
        this.cooldown = new ChallengeCooldown(clock, Duration.ofMinutes(1));
        this.clock = clock;
    }

    /**
     * The caller among their friends, ranked by the coins their wins took in the last week, then by wins. Everybody
     * is listed even with nothing won this week, so a quiet week still shows who is around; the caller is always on
     * it, which is what makes the board worth beating.
     */
    @Transactional(readOnly = true)
    public List<LeaderboardEntry> leaderboard(PlayerId caller) {
        List<UUID> players = new ArrayList<>();
        players.add(caller.value());
        results.opponentsOf(caller.value()).forEach(row -> players.add(row.getOpponent()));
        Instant since = clock.instant().minus(LEADERBOARD_WINDOW);
        Map<UUID, WinTotals> totals = results.winsSince(players, since).stream()
                .collect(Collectors.toMap(WinTotals::getPlayer, Function.identity()));
        return players.stream()
                .map(id -> {
                    WinTotals won = totals.get(id);
                    return new LeaderboardEntry(
                            id,
                            PlayerProfileView.of(accounts.summary(id)),
                            won == null ? 0 : (int) won.getWins(),
                            won == null ? 0 : won.getCoinsWon(),
                            id.equals(caller.value()));
                })
                .sorted(Comparator.comparingLong(LeaderboardEntry::coinsWon)
                        .reversed()
                        .thenComparing(
                                Comparator.comparingInt(LeaderboardEntry::wins).reversed())
                        .thenComparing(LeaderboardEntry::playerId))
                .limit(LEADERBOARD_SIZE)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FriendView> friendsOf(PlayerId caller) {
        return results.opponentsOf(caller.value()).stream()
                .map(row -> {
                    var who = accounts.summary(row.getOpponent());
                    return new FriendView(
                            who.id(),
                            who.username(),
                            who.displayName(),
                            who.handle(),
                            who.photoUrl(),
                            row.getPlayed(),
                            row.getWon(),
                            row.getLost(),
                            row.getLastPlayedAt());
                })
                .toList();
    }

    public InviteView challenge(PlayerId caller, UUID friend, long stake) {
        if (!results.havePlayed(caller.value(), friend)) {
            throw new BadRequestException("You can challenge players you have played before", "NOT_A_FRIEND");
        }
        UUID before = invites.pending(caller).map(InviteView::inviteId).orElse(null);
        InviteView invite = invites.create(caller, stake, friend);
        boolean fresh = !invite.inviteId().equals(before);
        // Only a new challenge is announced, at most once a minute per friend; best effort either way, the inbox
        // shows the challenge regardless.
        if (fresh && cooldown.allow(caller.value(), friend)) {
            String from = accounts.summary(caller.value()).displayName();
            accounts.telegramUserIdOf(friend)
                    .ifPresent(chat -> bot.notifyChallenge(
                            chat, from, stake, invite.inviteId().toString()));
        }
        log.info("Invite {} sent as a challenge", invite.inviteId());
        return invite;
    }

    public List<ChallengeView> incoming(PlayerId caller) {
        return invites.incoming(caller).stream()
                .map(invite -> {
                    var who = accounts.summary(invite.creator());
                    return new ChallengeView(
                            invite.inviteId(),
                            new ChallengeView.From(
                                    who.id(), who.username(), who.displayName(), who.handle(), who.photoUrl()),
                            invite.stake(),
                            invite.expiresAt());
                })
                .toList();
    }

    /** The caller's recent challenges, newest first, with the friend's current name. */
    public List<OutgoingChallengeView> outgoing(PlayerId caller) {
        return invites.outgoing(caller).stream()
                .map(challenge -> {
                    var who = accounts.summary(challenge.invitee());
                    return new OutgoingChallengeView(
                            challenge.inviteId(),
                            new OutgoingChallengeView.To(who.id(), who.username(), who.displayName()),
                            challenge.stake(),
                            challenge.outcome().name(),
                            challenge.createdAt(),
                            challenge.expiresAt());
                })
                .toList();
    }
}
