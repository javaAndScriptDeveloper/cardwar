package cardwar.monetization.repository;

import cardwar.monetization.domain.OwnedItem;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnedItemRepository extends JpaRepository<OwnedItem, OwnedItem.Key> {

    List<OwnedItem> findByPlayerId(UUID playerId);
}
