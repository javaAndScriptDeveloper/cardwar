package cardwar.session.service;

import cardwar.account.service.AccountService;
import cardwar.bot.service.TelegramBotService;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.session.dto.ChallengeView;
import cardwar.session.dto.FriendView;
import cardwar.session.dto.InviteView;
import cardwar.session.repository.DuelResultRepository;
import java.util.List;
import java.util.UUID;
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

    private final DuelResultRepository results;
    private final AccountService accounts;
    private final DuelInviteService invites;
    private final TelegramBotService bot;

    public FriendsService(
            DuelResultRepository results, AccountService accounts, DuelInviteService invites, TelegramBotService bot) {
        this.results = results;
        this.accounts = accounts;
        this.invites = invites;
        this.bot = bot;
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
        InviteView invite = invites.create(caller, stake, friend);
        String from = accounts.summary(caller.value()).displayName();
        // Best effort: a challenge stands even when the DM cannot be delivered; the inbox shows it either way.
        accounts.telegramUserIdOf(friend)
                .ifPresent(chat ->
                        bot.notifyChallenge(chat, from, stake, invite.inviteId().toString()));
        log.info("Invite {} sent as a challenge", invite.inviteId());
        return invite;
    }

    public List<ChallengeView> incoming(PlayerId caller) {
        return invites.incoming(caller).stream()
                .map(invite -> {
                    var who = accounts.summary(invite.creator());
                    return new ChallengeView(
                            invite.inviteId(),
                            new ChallengeView.From(who.id(), who.username(), who.displayName()),
                            invite.stake(),
                            invite.expiresAt());
                })
                .toList();
    }
}
