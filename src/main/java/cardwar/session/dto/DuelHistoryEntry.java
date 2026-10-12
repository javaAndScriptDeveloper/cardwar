package cardwar.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

/**
 * One finished duel as the caller experienced it: {@code result} is {@code WON}, {@code LOST} or {@code DRAW}
 * from their side of the table, so a client never has to compare ids to work out who they were. The opponent's
 * handle and photo are left out when they have none.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DuelHistoryEntry(
        UUID duelId,
        UUID opponentId,
        String opponentUsername,
        String opponentDisplayName,
        String opponentHandle,
        String opponentPhotoUrl,
        String result,
        String endReason,
        Instant startedAt,
        Instant finishedAt,
        int moveCount,
        long stake,
        long coinDelta) {}
