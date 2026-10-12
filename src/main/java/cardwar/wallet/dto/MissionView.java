package cardwar.wallet.dto;

/** One of today's missions as the player sees it: how far along, what it pays, whether that was collected. */
public record MissionView(String code, int target, int progress, long reward, boolean claimed) {}
