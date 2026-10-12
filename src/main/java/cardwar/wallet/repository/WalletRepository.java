package cardwar.wallet.repository;

import cardwar.wallet.domain.Wallet;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    /** Serialises every movement on one wallet: the balance check and the write happen under this row lock. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Wallet w where w.playerId = :playerId")
    Optional<Wallet> lock(@Param("playerId") UUID playerId);
}
