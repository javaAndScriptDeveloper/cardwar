package cardwar.exception;

import org.springframework.http.HttpStatus;

/**
 * A path that is deliberately not wired up in this phase — real-money purchases being the only one today. It is
 * distinct from a refusal on purpose: the caller did nothing wrong, and a client should not offer a retry.
 */
public class NotImplementedException extends ApplicationException {

    public NotImplementedException(String message) {
        super(HttpStatus.NOT_IMPLEMENTED, message);
    }
}
