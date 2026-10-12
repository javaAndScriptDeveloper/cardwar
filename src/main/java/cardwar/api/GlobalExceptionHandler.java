package cardwar.api;

import cardwar.engine.IllegalMoveException;
import cardwar.exception.ApplicationException;
import java.util.HashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Translates exceptions into RFC 9457 {@link ProblemDetail} responses (served as {@code application/problem+json}).
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApplicationException.class)
    public ProblemDetail handleApplicationException(ApplicationException ex) {
        log.debug("Application error: {}", ex.getMessage());
        var problem = ProblemDetail.forStatusAndDetail(ex.getStatus(), ex.getMessage());
        if (ex.getReason() != null) {
            problem.setProperty("reason", ex.getReason());
        }
        return problem;
    }

    /**
     * An illegal move is a client mistake, not a server fault: 400 with the engine's machine-readable reason so
     * the client can explain the rejection without parsing prose.
     */
    @ExceptionHandler(IllegalMoveException.class)
    public ProblemDetail handleIllegalMove(IllegalMoveException ex) {
        log.debug("Illegal move rejected: {}", ex.reason());
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
        problem.setTitle("Illegal move");
        problem.setProperty("reason", ex.reason().name());
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        var errors = new HashMap<String, String>();
        for (var error : ex.getBindingResult().getAllErrors()) {
            var field = error instanceof FieldError fieldError ? fieldError.getField() : error.getObjectName();
            errors.put(field, error.getDefaultMessage());
        }
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request validation failed");
        problem.setProperty("errors", errors);
        return problem;
    }

    /** Malformed JSON or an unknown command type — rejected before any domain logic runs. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleUnreadableBody(HttpMessageNotReadableException ex) {
        log.debug("Unreadable request body: {}", ex.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request body could not be read");
    }

    /**
     * Authorization is enforced in the services, which raise {@code ForbiddenException}. This covers the case
     * where Spring Security itself denies access, so it does not fall through to the catch-all below and turn a
     * 403 into a 500.
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDenied(AccessDeniedException ex) {
        log.debug("Access denied: {}", ex.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access denied");
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong");
    }
}
