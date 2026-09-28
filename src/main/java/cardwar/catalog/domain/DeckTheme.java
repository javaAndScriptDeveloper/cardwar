package cardwar.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A complete set of skins for the 36 cards. Exactly one theme is the default, enforced by a partial index. */
@Entity
@Table(name = "deck_theme")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeckTheme {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault;

    @Column(nullable = false)
    private boolean active;
}
