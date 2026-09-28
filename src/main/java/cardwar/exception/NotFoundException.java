package cardwar.exception;

import org.springframework.http.HttpStatus;

/** The requested resource does not exist, or the caller is not allowed to know that it does. */
public class NotFoundException extends ApplicationException {

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, message);
    }
}
