package cardwar.monetization.repository;

import cardwar.monetization.domain.UnlockRule;
import cardwar.monetization.dto.TargetType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UnlockRuleRepository extends JpaRepository<UnlockRule, UUID> {

    Optional<UnlockRule> findByTargetTypeAndTargetId(TargetType targetType, UUID targetId);
}
