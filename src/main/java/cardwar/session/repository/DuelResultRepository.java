package cardwar.session.repository;

import cardwar.session.domain.DuelResult;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DuelResultRepository extends JpaRepository<DuelResult, UUID> {

    Optional<DuelResult> findByDuelId(UUID duelId);

    boolean existsByDuelId(UUID duelId);

    /** Both seats are indexed columns, so pass the same id twice rather than adding a third one to the row. */
    List<DuelResult> findByPlayerAOrPlayerBOrderByFinishedAtDesc(UUID playerA, UUID playerB, Pageable page);
}
