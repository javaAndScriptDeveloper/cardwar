package cardwar.monetization.dto;

/**
 * How a shop item is acquired. {@code COINS} and {@code WIN_STREAK} are stored on the item; {@code DROP} appears
 * only in views, for an item whose sale window is one week in four.
 */
public enum UnlockKind {
    COINS,
    WIN_STREAK,
    DROP
}
