package cardwar.catalog.repository;

import cardwar.catalog.domain.Rarity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RarityRepository extends JpaRepository<Rarity, String> {}
