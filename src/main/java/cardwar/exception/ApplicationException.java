package cardwar.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * Base exception for application-level errors. Carries the HTTP status that
 * {@link cardwar.api.GlobalExceptionHandler} translates into an RFC 9457 problem detail.
 */
@Getter
public class ApplicationException extends RuntimeException {

    private final HttpStatus status;

    /** Machine-readable cause the client can translate (problem detail property {@code reason}); may be null. */
    private final String reason;

    public ApplicationException(HttpStatus status, String message) {
        this(status, message, (String) null);
    }

    public ApplicationException(HttpStatus status, String message, String reason) {
        super(message);
        this.status = status;
        this.reason = reason;
    }

    public ApplicationException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
        this.reason = null;
    }
}
