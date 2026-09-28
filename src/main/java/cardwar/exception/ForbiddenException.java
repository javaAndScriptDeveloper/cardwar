package cardwar.exception;

import org.springframework.http.HttpStatus;

/**
 * The caller is authenticated but is not allowed to perform this operation — typically acting on a duel they
 * are not a participant of. Raised by services, never only by controllers, so every transport is covered.
 */
public class ForbiddenException extends ApplicationException {

    public ForbiddenException(String message) {
        super(HttpStatus.FORBIDDEN, message);
    }
}
