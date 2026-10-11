package cardwar.session.service;

import cardwar.account.service.AccountService;
import cardwar.engine.DuelId;
import cardwar.engine.DurakEngine;
import cardwar.engine.GameCommand;
import cardwar.engine.PlayerId;
import cardwar.exception.BadRequestException;
import cardwar.exception.ForbiddenException;
import cardwar.exception.NotFoundException;
import cardwar.session.dto.DuelView;
import cardwar.session.event.DuelEventPublisher;
import cardwar.session.store.GameStateStore;
import cardwar.session.store.StoredDuel;
import java.time.Instant;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
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

    public DuelService(
            DurakEngine engine,
            GameStateStore store,
            DuelEventPublisher publisher,
            DuelCompletionService completion,
            AccountService accounts) {
        this.engine = engine;
        this.store = store;
        this.publisher = publisher;
        this.completion = completion;
        this.accounts = accounts;
    }

    /** Every duel is between two real accounts; there is deliberately no way to ask for a bot here. */
    public DuelView create(PlayerId caller, String opponentUsername) {
        UUID opponentId = accounts.requireIdByUsername(opponentUsername);
        return start(caller, new PlayerId(opponentId), new DuelId(UUID.randomUUID()));
    }

    /**
     * Starts a duel between two known players under a caller-chosen id. The invite flow picks the id before the duel
     * exists so it can record it atomically with the acceptance.
     */
    public DuelView start(PlayerId caller, PlayerId opponent, DuelId duelId) {
        if (opponent.equals(caller)) {
            throw new BadRequestException("A duel needs two different players");
        }
        var result = engine.start(duelId, caller, opponent);
        var stored = new StoredDuel(result.state(), Instant.now());

        store.save(stored, GameStateStore.ABSENT);
        publisher.publish(duelId, result.events());
        log.info("Duel {} created", duelId.value());
        return DuelView.of(result.state(), caller);
    }

    /**
     * Applies one command. The engine re-validates it against the stored state, so an illegal move fails here
     * even if a client believed it was legal — and fails before anything is written, leaving the duel untouched.
     */
    public DuelView applyCommand(UUID duelId, PlayerId caller, GameCommand command) {
        StoredDuel stored = requireParticipation(duelId, caller);
        long expectedVersion = stored.state().version();

        var result = engine.apply(stored.state(), caller, command);
        StoredDuel next = stored.with(result.state());
        store.save(next, expectedVersion);
        publisher.publish(next.state().duelId(), result.events());

        if (next.state().isFinished()) {
            completion.complete(next, Instant.now());
            // Only once the result is durable: until then the state store is the only copy of this duel.
            store.delete(next.state().duelId());
        }
        return DuelView.of(next.state(), caller);
    }

    public DuelView viewFor(UUID duelId, PlayerId caller) {
        return DuelView.of(requireParticipation(duelId, caller).state(), caller);
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
