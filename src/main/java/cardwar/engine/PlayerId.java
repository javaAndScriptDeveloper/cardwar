package cardwar.engine;

import java.util.Objects;
import java.util.UUID;

/** Identifies a player to the engine. The engine attaches no meaning to it beyond equality. */
public record PlayerId(UUID value) {

    public PlayerId {
        Objects.requireNonNull(value, "value");
    }

    public static PlayerId of(UUID value) {
        return new PlayerId(value);
    }

    @Override
    public String toString() {
        return value.toString();
    }
}
