package cardwar.session.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One finished duel as the caller experienced it: {@code result} is {@code WON}, {@code LOST} or {@code DRAW}
 * from their side of the table, so a client never has to compare ids to work out who they were.
 */
public record DuelHistoryEntry(
        UUID duelId,
        UUID opponentId,
        String opponentUsername,
        String result,
        String endReason,
        Instant startedAt,
        Instant finishedAt,
        int moveCount) {}
