package cardwar.session.dto;

import cardwar.engine.DuelPhase;
import java.util.UUID;

/**
 * An in-progress duel as a list entry: enough to find the way back to the table, and no card at all. The cards come
 * from the full redacted view, fetched once the client opens the duel.
 */
public record DuelSummary(
        UUID duelId,
        UUID opponentId,
        String opponentUsername,
        UUID attacker,
        DuelPhase phase,
        long version,
        long stake) {}
