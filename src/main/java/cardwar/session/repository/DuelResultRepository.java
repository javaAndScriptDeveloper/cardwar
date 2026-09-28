package cardwar.session.repository;

import cardwar.session.domain.DuelResult;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DuelResultRepository extends JpaRepository<DuelResult, UUID> {

    Optional<DuelResult> findByDuelId(UUID duelId);

    boolean existsByDuelId(UUID duelId);
}
