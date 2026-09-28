package cardwar.catalog.repository;

import cardwar.catalog.domain.DeckTheme;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeckThemeRepository extends JpaRepository<DeckTheme, UUID> {

    Optional<DeckTheme> findByCode(String code);

    Optional<DeckTheme> findByIsDefaultTrue();

    List<DeckTheme> findAllByActiveTrueOrderByCode();
}
