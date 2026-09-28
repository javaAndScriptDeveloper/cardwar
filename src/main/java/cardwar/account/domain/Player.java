package cardwar.account.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A player account. The password is present only as a BCrypt hash — there is no plaintext field to leak. */
@Entity
@Table(name = "player")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Player {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public Player(UUID id, String username, String passwordHash, String displayName, Instant createdAt) {
        this.id = id;
        this.username = username;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.createdAt = createdAt;
    }
}
