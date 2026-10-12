package cardwar.monetization.repository;

import cardwar.monetization.domain.LoadoutSlot;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoadoutSlotRepository extends JpaRepository<LoadoutSlot, LoadoutSlot.Key> {

    List<LoadoutSlot> findByPlayerId(UUID playerId);
}
