package cardwar.engine;

/**
 * A command was rejected because it is not legal against the current duel state. The engine validates every
 * command itself and never assumes the caller pre-checked it, so this is the only way an invalid move leaves
 * the engine — it is never silently ignored or partially applied.
 */
public class IllegalMoveException extends RuntimeException {

    private final transient IllegalMoveReason reason;

    public IllegalMoveException(IllegalMoveReason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public IllegalMoveReason reason() {
        return reason;
    }
}
