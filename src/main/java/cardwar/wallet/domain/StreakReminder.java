package cardwar.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** One streak reminder that went out: the primary key (player, Kyiv day) is what keeps a restart from resending. */
@Entity
@Table(name = "streak_reminder")
@IdClass(StreakReminder.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StreakReminder {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Id
    @Column(name = "day")
    private LocalDate day;

    public StreakReminder(UUID playerId, LocalDate day) {
        this.playerId = playerId;
        this.day = day;
    }

    public record Key(UUID playerId, LocalDate day) implements Serializable {}
}
