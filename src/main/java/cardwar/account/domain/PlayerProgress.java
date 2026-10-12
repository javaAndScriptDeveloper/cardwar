package cardwar.account.domain;

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
 * Gameplay progress, kept apart from the account row because it is written after every duel while the account
 * itself is not. The legacy currency_balance column is no longer mapped: coins live in the wallet module's ledger
 * (changeset 007 moved them there).
 */
@Entity
@Table(name = "player_progress")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlayerProgress {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Column(name = "duels_played", nullable = false)
    private int duelsPlayed;

    @Column(name = "duels_won", nullable = false)
    private int duelsWon;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public PlayerProgress(UUID playerId, Instant updatedAt) {
        this.playerId = playerId;
        this.updatedAt = updatedAt;
    }
}
