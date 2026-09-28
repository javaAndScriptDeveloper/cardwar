package cardwar.session.event;

import cardwar.engine.DuelId;

/** The channel naming shared by the publisher and every subscriber. */
public final class DuelChannels {

    private static final String PREFIX = "cardwar:duel:";
    private static final String SUFFIX = ":events";

    /** Matches every duel's event channel; subscribers register once rather than per duel. */
    public static final String PATTERN = PREFIX + "*" + SUFFIX;

    private DuelChannels() {}

    public static String forDuel(DuelId duelId) {
        return PREFIX + duelId.value() + SUFFIX;
    }
}
