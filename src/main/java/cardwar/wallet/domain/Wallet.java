package cardwar.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** The running total of a player's ledger. Changed only by WalletService, under a row lock. */
@Entity
@Table(name = "wallet")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Wallet {

    @Id
    @Column(name = "player_id")
    private UUID playerId;

    @Column(name = "balance", nullable = false)
    private long balance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Wallet(UUID playerId, Instant now) {
        this.playerId = playerId;
        this.updatedAt = now;
    }

    public void apply(long amount, Instant now) {
        this.balance += amount;
        this.updatedAt = now;
    }
}
