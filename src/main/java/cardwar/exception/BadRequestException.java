package cardwar.exception;

import org.springframework.http.HttpStatus;

/** The request is well-formed but semantically invalid for the current state. */
public class BadRequestException extends ApplicationException {

    public BadRequestException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }

    public BadRequestException(String message, String reason) {
        super(HttpStatus.BAD_REQUEST, message, reason);
    }
}
