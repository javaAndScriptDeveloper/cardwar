package cardwar.wallet.domain;

import cardwar.wallet.dto.CoinKind;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** One immutable ledger row. Signed: credits positive, debits negative. */
@Entity
@Table(name = "coin_transaction")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoinTransaction {

    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "player_id", nullable = false)
    private UUID playerId;

    @Column(name = "amount", nullable = false)
    private long amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 32)
    private CoinKind kind;

    @Column(name = "reference", nullable = false, length = 64)
    private String reference;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public CoinTransaction(UUID playerId, long amount, CoinKind kind, String reference, Instant createdAt) {
        this.id = UUID.randomUUID();
        this.playerId = playerId;
        this.amount = amount;
        this.kind = kind;
        this.reference = reference;
        this.createdAt = createdAt;
    }
}
