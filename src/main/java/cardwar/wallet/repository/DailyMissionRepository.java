package cardwar.wallet.repository;

import cardwar.wallet.domain.DailyMission;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyMissionRepository extends JpaRepository<DailyMission, DailyMission.Key> {

    List<DailyMission> findByPlayerIdAndDay(UUID playerId, LocalDate day);
}
