package cardwar.session.service;

import cardwar.account.service.AccountService;
import cardwar.engine.DuelId;
import cardwar.engine.DurakEngine;
import cardwar.engine.DurakRules;
import cardwar.engine.GameCommand;
import cardwar.engine.IllegalMoveException;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.exception.ForbiddenException;
import cardwar.exception.NotFoundException;
import cardwar.metrics.GameMetrics;
import cardwar.metrics.GameMetrics.MoveOutcome;
import cardwar.metrics.GameMetrics.StartMode;
import cardwar.monetization.service.ShopService;
import cardwar.session.dto.DuelSummary;
import cardwar.session.dto.DuelView;
import cardwar.session.dto.PlayerProfileView;
import cardwar.session.event.DuelEventPublisher;
import cardwar.session.store.GameStateStore;
import cardwar.session.store.StoredDuel;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The duel lifecycle. Authorization lives here rather than in the controller: a Telegram adapter or a test that
 * calls this service directly gets exactly the same participation checks a REST caller does.
 *
 * <p>Nothing in this class logs a card. Hands are the one thing a duel keeps secret, and a log file is not a
 * place secrets survive.
 */
@Slf4j
@Service
public class DuelService {

    private final DurakEngine engine;
    private final GameStateStore store;
    private final DuelEventPublisher publisher;
    private final DuelCompletionService completion;
    private final AccountService accounts;
    private final GameMetrics metrics;
    private final Clock clock;
    private final Duration moveTimeout;
    private final ShopService shop;

    /** Clocks a player may let run out; the next one forfeits the duel. */
    static final int STRIKES_TO_FORFEIT = 3;

    @SuppressWarnings("checkstyle:ParameterNumber")
    public DuelService(
            DurakEngine engine,
            GameStateStore store,
            DuelEventPublisher publisher,
            DuelCompletionService completion,
            AccountService accounts,
            GameMetrics metrics,
            Clock clock,
            @Value("${cardwar.duel.move-timeout:30s}") Duration moveTimeout,
            ShopService shop) {
        this.engine = engine;
        this.store = store;
        this.publisher = publisher;
        this.completion = completion;
        this.accounts = accounts;
        this.metrics = metrics;
        this.clock = clock;
        this.moveTimeout = moveTimeout;
        this.shop = shop;
    }

    /** Every duel is between two real accounts; there is deliberately no way to ask for a bot here. */
    public DuelView create(PlayerId caller, String opponentUsername) {
        UUID opponentId = accounts.requireIdByUsername(opponentUsername);
        return start(caller, new PlayerId(opponentId), new DuelId(UUID.randomUUID()), 0, StartMode.DIRECT);
    }

    /**
     * Starts a duel between two known players under a caller-chosen id. The invite flow picks the id before the duel
     * exists so it can record it atomically with the acceptance.
     */
    public DuelView start(PlayerId caller, PlayerId opponent, DuelId duelId, long stake) {
        return start(caller, opponent, duelId, stake, StartMode.INVITE);
    }

    /** As {@link #start}, for a pair the quick-match queue made. */
    public DuelView startQuickMatch(PlayerId caller, PlayerId opponent, DuelId duelId, long stake) {
        return start(caller, opponent, duelId, stake, StartMode.QUICK);
    }

    private DuelView start(PlayerId caller, PlayerId opponent, DuelId duelId, long stake, StartMode mode) {
        if (opponent.equals(caller)) {
            throw new BadRequestException("A duel needs two different players");
        }
        var result = engine.start(duelId, caller, opponent);
        Instant now = clock.instant();
        var stored = new StoredDuel(result.state(), now, stake, now.plus(moveTimeout), 0, 0);

        store.save(stored, GameStateStore.ABSENT);
        publisher.publish(duelId, result.events());
        log.info("Duel {} created", duelId.value());
        metrics.duelStarted(mode);
        return DuelView.of(stored, caller);
    }

    /**
     * Applies one command. The engine re-validates it against the stored state, so an illegal move fails here
     * even if a client believed it was legal — and fails before anything is written, leaving the duel untouched.
     */
    public DuelView applyCommand(UUID duelId, PlayerId caller, GameCommand command) {
        StoredDuel stored = requireParticipation(duelId, caller);
        long expectedVersion = stored.state().version();

        StoredDuel next;
        try {
            var result = engine.apply(stored.state(), caller, command);
            // A move the player made themselves clears their strikes and gives whoever is to move a fresh clock.
            next = clocked(stored.with(result.state()).withStrikes(caller, 0), clock.instant());
            store.save(next, expectedVersion);
            publisher.publish(next.state().duelId(), result.events());
        } catch (IllegalMoveException rejected) {
            metrics.move(command, MoveOutcome.REJECTED);
            throw rejected;
        } catch (ConflictException lostRace) {
            metrics.move(command, MoveOutcome.CONFLICT);
            throw lostRace;
        }
        metrics.move(command, MoveOutcome.OK);
        finishIfOver(next);
        return DuelView.of(next, caller);
    }

    /**
     * Plays for the player whose clock ran out at {@code now}: the least damaging legal move, or a forfeit on their
     * third strike. False when there is nothing to do: the duel is gone or over, or its clock has not run out (a real
     * move moved the deadline, which is also how a race with a real move is lost; the CAS covers the rest).
     */
    public boolean applyTimeout(UUID duelId, Instant now) {
        StoredDuel stored = store.find(new DuelId(duelId)).orElse(null);
        if (stored == null
                || stored.state().isFinished()
                || stored.deadline() == null
                || stored.deadline().isAfter(now)) {
            return false;
        }
        PlayerId late = DurakRules.toMove(stored.state());
        int strikes = stored.strikesOf(late) + 1;
        GameCommand command =
                strikes >= STRIKES_TO_FORFEIT ? new GameCommand.Resign() : DurakRules.timeoutCommand(stored.state());
        StoredDuel next;
        try {
            var result = engine.apply(stored.state(), late, command);
            next = clocked(stored.with(result.state()).withStrikes(late, strikes), now);
            store.save(next, stored.state().version());
            publisher.publish(next.state().duelId(), result.events());
        } catch (ConflictException lostRace) {
            return false;
        }
        log.info("Duel {}: clock ran out, strike {} for the player to move", duelId, strikes);
        metrics.move(command, MoveOutcome.AUTO);
        finishIfOver(next);
        return true;
    }

    private StoredDuel clocked(StoredDuel duel, Instant now) {
        return duel.withDeadline(duel.state().isFinished() ? null : now.plus(moveTimeout));
    }

    private void finishIfOver(StoredDuel next) {
        if (next.state().isFinished()) {
            completion.complete(next, clock.instant());
            metrics.duelFinished(next.state().outcome());
            // Only once the result is durable: until then the state store is the only copy of this duel.
            store.delete(next.state().duelId());
        }
    }

    /** Only the caller's own duels: the index is per player, so there is nothing else to filter out. */
    public List<DuelSummary> active(PlayerId caller) {
        return store.findActive(caller).stream()
                .filter(stored -> stored.state().hasParticipant(caller))
                .map(stored -> {
                    var state = stored.state();
                    PlayerId opponent = state.opponentOf(caller);
                    var who = accounts.summary(opponent.value());
                    return new DuelSummary(
                            state.duelId().value(),
                            opponent.value(),
                            who.username(),
                            who.displayName(),
                            who.handle(),
                            who.photoUrl(),
                            state.attackerId().value(),
                            state.phase(),
                            state.version(),
                            stored.stake());
                })
                .toList();
    }

    public DuelView viewFor(UUID duelId, PlayerId caller) {
        StoredDuel stored = requireParticipation(duelId, caller);
        PlayerId opponent = stored.state().opponentOf(caller);
        return DuelView.of(stored, caller)
                .withOpponent(
                        shop.cosmeticsOf(opponent.value()), PlayerProfileView.of(accounts.summary(opponent.value())));
    }

    /** Used by the event stream, which needs the participation check without needing the state itself. */
    public DuelId requireParticipant(UUID duelId, PlayerId caller) {
        return requireParticipation(duelId, caller).state().duelId();
    }

    private StoredDuel requireParticipation(UUID duelId, PlayerId caller) {
        StoredDuel stored = store.find(new DuelId(duelId))
                .orElseThrow(() -> new NotFoundException("No duel in progress with that id"));
        if (!stored.state().hasParticipant(caller)) {
            // Same message either way: whether a duel exists is not a non-participant's business.
            throw new ForbiddenException("You are not a participant of this duel");
        }
        return stored;
    }
}
