package cardwar.monetization.repository;

import cardwar.monetization.domain.ShopItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShopItemRepository extends JpaRepository<ShopItem, String> {

    List<ShopItem> findByActiveTrueOrderByTypeAscSortOrderAsc();
}
