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

/** One claimed daily bonus. The primary key (player, Kyiv date) is what makes a second claim impossible. */
@Entity
@Table(name = "daily_bonus_claim")
@IdClass(DailyBonusClaim.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DailyBonusClaim {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Id
    @Column(name = "bonus_date")
    private LocalDate bonusDate;

    @Column(name = "streak_day", nullable = false)
    private int streakDay;

    @Column(name = "amount", nullable = false)
    private long amount;

    @Column(name = "claimed_at", nullable = false)
    private Instant claimedAt;

    public DailyBonusClaim(UUID playerId, LocalDate bonusDate, int streakDay, long amount, Instant claimedAt) {
        this.playerId = playerId;
        this.bonusDate = bonusDate;
        this.streakDay = streakDay;
        this.amount = amount;
        this.claimedAt = claimedAt;
    }

    public record Key(UUID playerId, LocalDate bonusDate) implements Serializable {}
}
