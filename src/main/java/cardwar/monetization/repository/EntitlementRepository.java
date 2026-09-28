package cardwar.monetization.repository;

import cardwar.monetization.domain.Entitlement;
import cardwar.monetization.dto.TargetType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EntitlementRepository extends JpaRepository<Entitlement, UUID> {

    List<Entitlement> findAllByPlayerId(UUID playerId);

    Optional<Entitlement> findByPlayerIdAndTargetTypeAndTargetId(UUID playerId, TargetType targetType, UUID targetId);
}
