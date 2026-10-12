package cardwar.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A player's progress on one mission for one Kyiv day. Created on the first step, so a day with no duels leaves no
 * rows; the primary key (player, day, code) is also what makes a claim happen once.
 */
@Entity
@Table(name = "daily_mission")
@IdClass(DailyMission.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DailyMission {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Id
    @Column(name = "day")
    private LocalDate day;

    @Id
    @Column(name = "code", length = 16)
    private String code;

    @Column(name = "progress", nullable = false)
    private int progress;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    public DailyMission(UUID playerId, LocalDate day, String code) {
        this.playerId = playerId;
        this.day = day;
        this.code = code;
    }

    /** One step further, never past the target. */
    public void advance(int target) {
        progress = Math.min(target, progress + 1);
    }

    public boolean isClaimed() {
        return claimedAt != null;
    }

    public void claim(Instant now) {
        claimedAt = now;
    }

    public record Key(UUID playerId, LocalDate day, String code) implements Serializable {}
}
