package cardwar.wallet.repository;

import cardwar.wallet.domain.DailyBonusClaim;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyBonusClaimRepository extends JpaRepository<DailyBonusClaim, DailyBonusClaim.Key> {

    Optional<DailyBonusClaim> findTopByPlayerIdOrderByBonusDateDesc(UUID playerId);
}
