package cardwar.exception;

import org.springframework.http.HttpStatus;

/**
 * The request collided with the current state: a duplicate registration, or a duel move computed against a
 * version of the state that has since moved on. Retrying a conflicting move is the caller's decision, not
 * ours — the state it was based on no longer exists.
 */
public class ConflictException extends ApplicationException {

    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, message);
    }
}
