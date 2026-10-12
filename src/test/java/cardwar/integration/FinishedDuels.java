package cardwar.integration;

import cardwar.engine.Card;
import cardwar.engine.DuelId;
import cardwar.engine.DuelPhase;
import cardwar.engine.DuelState;
import cardwar.engine.Outcome;
import cardwar.engine.PlayerId;
import cardwar.engine.Rank;
import cardwar.engine.Suit;
import cardwar.session.service.DuelCompletionService;
import cardwar.session.store.StoredDuel;
import cardwar.wallet.service.WalletService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Finishes duels with a chosen outcome without playing them: a hand-built finished state goes straight through
 * {@link DuelCompletionService}, exactly as the last move or the sweep would hand it over. Playing to completion over
 * the API decides the winner by the shuffle, which is no use to a test about what winning does.
 */
final class FinishedDuels {

    private final DuelCompletionService completion;
    private final WalletService wallets;

    FinishedDuels(DuelCompletionService completion, WalletService wallets) {
        this.completion = completion;
        this.wallets = wallets;
    }

    /** {@code winner} beats {@code loser} for {@code stake} each; the stake is escrowed first, as on acceptance. */
    UUID won(ApiDriver.Player winner, ApiDriver.Player loser, long stake) {
        return complete(decided(winner, loser, stake));
    }

    UUID drawn(ApiDriver.Player one, ApiDriver.Player two, long stake) {
        return complete(finished(one, two, Outcome.drawn(), stake));
    }

    StoredDuel decided(ApiDriver.Player winner, ApiDriver.Player loser, long stake) {
        return finished(winner, loser, Outcome.decided(new PlayerId(winner.id()), new PlayerId(loser.id())), stake);
    }

    private StoredDuel finished(ApiDriver.Player a, ApiDriver.Player b, Outcome outcome, long stake) {
        UUID duelId = UUID.randomUUID();
        if (stake > 0) {
            wallets.escrow(duelId.toString(), stake, a.id(), b.id());
        }
        var state = new DuelState(
                new DuelId(duelId),
                new PlayerId(a.id()),
                new PlayerId(b.id()),
                List.of(),
                List.of(),
                List.of(),
                new Card(Rank.SIX, Suit.SPADES),
                Suit.SPADES,
                List.of(),
                List.of(),
                new PlayerId(a.id()),
                DuelPhase.FINISHED,
                outcome,
                12);
        return new StoredDuel(state, Instant.now().minusSeconds(60), stake);
    }

    private UUID complete(StoredDuel duel) {
        completion.complete(duel, Instant.now());
        return duel.state().duelId().value();
    }
}
