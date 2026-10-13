package cardwar.wallet.repository;

import cardwar.wallet.domain.StreakReminder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StreakReminderRepository extends JpaRepository<StreakReminder, StreakReminder.Key> {}
