package cardwar.session.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The only trace a duel leaves in Postgres. It records who played, how it ended and how long it took — and
 * deliberately nothing about hands, table or talon, which live in the state store and die with it.
 */
@Entity
@Table(name = "duel_result")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DuelResult {

    @Id
    private UUID id;

    @Column(name = "duel_id", nullable = false, unique = true)
    private UUID duelId;

    @Column(name = "player_a", nullable = false)
    private UUID playerA;

    @Column(name = "player_b", nullable = false)
    private UUID playerB;

    @Column(name = "winner_id")
    private UUID winnerId;

    @Column(name = "loser_id")
    private UUID loserId;

    @Column(nullable = false)
    private boolean draw;

    @Column(name = "end_reason", nullable = false)
    private String endReason;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at", nullable = false)
    private Instant finishedAt;

    @Column(name = "move_count", nullable = false)
    private int moveCount;

    @Column(name = "stake", nullable = false)
    private long stake;

    @SuppressWarnings("checkstyle:ParameterNumber")
    public DuelResult(
            UUID id,
            UUID duelId,
            UUID playerA,
            UUID playerB,
            UUID winnerId,
            UUID loserId,
            boolean draw,
            String endReason,
            Instant startedAt,
            Instant finishedAt,
            int moveCount,
            long stake) {
        this.id = id;
        this.duelId = duelId;
        this.playerA = playerA;
        this.playerB = playerB;
        this.winnerId = winnerId;
        this.loserId = loserId;
        this.draw = draw;
        this.endReason = endReason;
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
        this.moveCount = moveCount;
        this.stake = stake;
    }
}
