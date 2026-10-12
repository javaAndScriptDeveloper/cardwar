package cardwar.session.service;

import cardwar.engine.DuelId;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.exception.ForbiddenException;
import cardwar.exception.NotFoundException;
import cardwar.session.dto.DuelView;
import cardwar.session.dto.InviteView;
import cardwar.session.store.InviteStore;
import cardwar.session.store.StoredInvite;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Matchmaking by invitation: the one way two Telegram users find each other in this phase. A creates an invite and
 * shares its id in a deep link; whoever opens it first starts the duel against A.
 *
 * <p>The creator cannot subscribe to a duel that does not exist yet, so it polls {@link #status} until the invite
 * names a duel. A push channel per player would avoid the polling; at one request every two seconds for at most
 * the invite's lifetime, it is not worth one yet.
 */
@Slf4j
@Service
public class DuelInviteService {

    private final InviteStore invites;
    private final DuelService duels;

    public DuelInviteService(InviteStore invites, DuelService duels) {
        this.invites = invites;
        this.duels = duels;
    }

    /** Idempotent while the caller's invite is pending, so reopening the app and tapping again keeps the code. */
    public InviteView create(PlayerId caller) {
        StoredInvite invite = invites.create(caller.value());
        log.info("Invite {} issued", invite.inviteId());
        return view(invite);
    }

    public Optional<InviteView> pending(PlayerId caller) {
        return invites.findPending(caller.value()).map(DuelInviteService::view);
    }

    public DuelView accept(PlayerId caller, String inviteId) {
        StoredInvite invite = require(inviteId);
        if (invite.creator().equals(caller.value())) {
            throw new BadRequestException("You cannot accept your own invite");
        }
        var duelId = new DuelId(UUID.randomUUID());
        switch (invites.claim(invite.inviteId(), caller.value(), duelId.value())) {
            case MISSING -> throw new NotFoundException("No such invite, or it has expired");
            case ALREADY_ACCEPTED -> throw new ConflictException("This invite has already been accepted");
            case CLAIMED -> log.info("Invite {} accepted", invite.inviteId());
        }
        // The acceptor is now busy; their own open invite must not drag them into a second duel.
        invites.cancelPending(caller.value());
        return duels.start(caller, new PlayerId(invite.creator()), duelId);
    }

    public InviteView status(PlayerId caller, String inviteId) {
        StoredInvite invite = require(inviteId);
        if (!invite.involves(caller.value())) {
            throw new ForbiddenException("This is not your invite");
        }
        return view(invite);
    }

    /** A malformed id is simply an invite that does not exist; it gets the same 404. */
    private StoredInvite require(String inviteId) {
        UUID id;
        try {
            id = UUID.fromString(inviteId);
        } catch (IllegalArgumentException malformed) {
            throw new NotFoundException("No such invite, or it has expired");
        }
        return invites.find(id).orElseThrow(() -> new NotFoundException("No such invite, or it has expired"));
    }

    private static InviteView view(StoredInvite invite) {
        return new InviteView(invite.inviteId(), invite.status().name(), invite.duelId(), invite.expiresAt());
    }
}
