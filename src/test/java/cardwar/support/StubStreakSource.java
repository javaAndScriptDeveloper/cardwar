package cardwar.support;

import cardwar.monetization.grant.StreakSource;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;

/**
 * Lets a test hand a player a win streak without playing the duels. Players without an override fall through to
 * whatever other {@link StreakSource} the context has (the account-backed one once it exists, the 0 default
 * otherwise), so end-to-end tests of the real source keep working beside this stub.
 */
public final class StubStreakSource implements StreakSource {

    private final Map<UUID, Integer> overrides = new ConcurrentHashMap<>();
    private final ObjectProvider<StreakSource> others;

    public StubStreakSource(ObjectProvider<StreakSource> others) {
        this.others = others;
    }

    public void set(UUID playerId, int bestWinStreak) {
        overrides.put(playerId, bestWinStreak);
    }

    public void reset() {
        overrides.clear();
    }

    @Override
    public int bestWinStreak(UUID playerId) {
        Integer override = overrides.get(playerId);
        if (override != null) {
            return override;
        }
        return others.orderedStream()
                .filter(source -> source != this)
                .mapToInt(source -> source.bestWinStreak(playerId))
                .max()
                .orElse(0);
    }
}
