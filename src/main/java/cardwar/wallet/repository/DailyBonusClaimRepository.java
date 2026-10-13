package cardwar.wallet.repository;

import cardwar.wallet.domain.DailyBonusClaim;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DailyBonusClaimRepository extends JpaRepository<DailyBonusClaim, DailyBonusClaim.Key> {

    Optional<DailyBonusClaim> findTopByPlayerIdOrderByBonusDateDesc(UUID playerId);

    /**
     * Yesterday's claims that reached at least {@code minStreak} by players who have not claimed today: the streaks
     * that lapse at midnight unless somebody acts. A player who skipped yesterday has nothing left to save.
     */
    @Query("select c from DailyBonusClaim c where c.bonusDate = :yesterday and c.streakDay >= :minStreak"
            + " and not exists (select t from DailyBonusClaim t"
            + " where t.playerId = c.playerId and t.bonusDate = :today)")
    List<DailyBonusClaim> streaksAtRisk(
            @Param("yesterday") LocalDate yesterday,
            @Param("today") LocalDate today,
            @Param("minStreak") int minStreak);
}
