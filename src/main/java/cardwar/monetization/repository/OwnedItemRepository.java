package cardwar.monetization.repository;

import cardwar.monetization.domain.OwnedItem;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface OwnedItemRepository extends JpaRepository<OwnedItem, OwnedItem.Key> {

    List<OwnedItem> findByPlayerId(UUID playerId);

    /**
     * Records an earned item unless the player already has it. Two shop visits in flight for the same player both
     * try to grant; the primary key decides and the loser inserts nothing, without failing its transaction.
     */
    @Modifying
    @Query(
            value =
                    """
                    INSERT INTO owned_item (player_id, item_code, source, acquired_at)
                    VALUES (:playerId, :code, :source, :acquiredAt)
                    ON CONFLICT DO NOTHING
                    """,
            nativeQuery = true)
    int grantIfAbsent(UUID playerId, String code, String source, Instant acquiredAt);
}
