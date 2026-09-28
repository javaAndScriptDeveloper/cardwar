package cardwar.account.repository;

import cardwar.account.domain.PlayerProgress;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerProgressRepository extends JpaRepository<PlayerProgress, UUID> {}
