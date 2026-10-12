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

/** A player waiting at a stake table, or a waiting player who has just been paired (matchedDuelId set). */
@Entity
@Table(name = "matchmaking_entry")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MatchmakingEntry {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Column(name = "stake", nullable = false)
    private long stake;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "matched_duel_id")
    private UUID matchedDuelId;

    public MatchmakingEntry(UUID playerId, long stake, Instant createdAt) {
        this.playerId = playerId;
        this.stake = stake;
        this.createdAt = createdAt;
    }

    public void matched(UUID duelId) {
        this.matchedDuelId = duelId;
    }
}
