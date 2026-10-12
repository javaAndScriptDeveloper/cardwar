package cardwar.session.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.UUID;

/** Where the caller stands in quick match. {@code duelId} is set once MATCHED. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MatchView(Status status, long stake, Instant since, UUID duelId) {

    public enum Status {
        WAITING,
        MATCHED,
        EXPIRED
    }
}
