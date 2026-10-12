package cardwar.monetization.dto;

/**
 * What stands between the player and an item that coins alone do not buy: a streak length still to reach, or a
 * drop slot whose week this is ({@code met}) or is not.
 */
public record UnlockView(UnlockKind kind, int value, boolean met) {}
