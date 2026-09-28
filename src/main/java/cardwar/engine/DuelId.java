package cardwar.engine;

import java.util.Objects;
import java.util.UUID;

/** Identifies a single duel. */
public record DuelId(UUID value) {

    public DuelId {
        Objects.requireNonNull(value, "value");
    }

    public static DuelId of(UUID value) {
        return new DuelId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
