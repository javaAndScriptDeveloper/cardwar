package cardwar.catalog.repository;

import cardwar.catalog.domain.CardSkin;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CardSkinRepository extends JpaRepository<CardSkin, UUID> {

    @Query("select s from CardSkin s join fetch s.rarity where s.theme.id = :themeId and s.active = true")
    List<CardSkin> findActiveByTheme(UUID themeId);

    @Query("select s from CardSkin s join fetch s.rarity join fetch s.theme where s.code = :code")
    Optional<CardSkin> findByCodeWithRarity(String code);

    @Query("select s from CardSkin s join fetch s.rarity join fetch s.theme where s.id = :id")
    Optional<CardSkin> findByIdWithRarity(UUID id);
}
