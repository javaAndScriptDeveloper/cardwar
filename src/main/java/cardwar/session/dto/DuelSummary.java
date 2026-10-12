package cardwar.session.dto;

import cardwar.engine.DuelPhase;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

/**
 * An in-progress duel as a list entry: enough to find the way back to the table, and no card at all. The cards come
 * from the full redacted view, fetched once the client opens the duel. The opponent's handle and photo are left out
 * when they have none.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DuelSummary(
        UUID duelId,
        UUID opponentId,
        String opponentUsername,
        String opponentDisplayName,
        String opponentHandle,
        String opponentPhotoUrl,
        UUID attacker,
        DuelPhase phase,
        long version,
        long stake) {}
