package cardwar.account.repository;

import cardwar.account.domain.Player;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerRepository extends JpaRepository<Player, UUID> {

    Optional<Player> findByUsername(String username);

    boolean existsByUsername(String username);

    Optional<Player> findByTelegramUserId(long telegramUserId);
}
