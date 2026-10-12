package cardwar.wallet.repository;

import cardwar.wallet.domain.CoinTransaction;
import cardwar.wallet.dto.CoinKind;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CoinTransactionRepository extends JpaRepository<CoinTransaction, UUID> {

    boolean existsByPlayerIdAndKindAndReference(UUID playerId, CoinKind kind, String reference);

    List<CoinTransaction> findTop50ByPlayerIdOrderByCreatedAtDesc(UUID playerId);

    List<CoinTransaction> findByReferenceAndKind(String reference, CoinKind kind);

    boolean existsByReferenceAndKindIn(String reference, Collection<CoinKind> kinds);

    @Query("select coalesce(sum(t.amount), 0) from CoinTransaction t where t.playerId = :playerId")
    long sumByPlayer(@Param("playerId") UUID playerId);

    @Query("select coalesce(sum(t.amount), 0) from CoinTransaction t"
            + " where t.playerId = :playerId and t.reference = :reference")
    long sumByPlayerAndReference(@Param("playerId") UUID playerId, @Param("reference") String reference);

    /** Escrows older than {@code before} with no payout or refund under the same reference. */
    @Query("select distinct e.reference from CoinTransaction e where e.kind = cardwar.wallet.dto.CoinKind.STAKE_ESCROW"
            + " and e.createdAt < :before and not exists (select 1 from CoinTransaction s where s.reference ="
            + " e.reference and s.kind in (cardwar.wallet.dto.CoinKind.STAKE_PAYOUT,"
            + " cardwar.wallet.dto.CoinKind.STAKE_REFUND))")
    List<String> unsettledEscrowReferences(@Param("before") Instant before);
}
