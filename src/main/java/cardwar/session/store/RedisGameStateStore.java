package cardwar.session.store;

import cardwar.engine.DuelId;
import cardwar.engine.DuelState;
import cardwar.exception.ConflictException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Redis-backed active duel state. One hash per duel holding the serialized state, its version and the start
 * timestamp, with a TTL refreshed on every write — an abandoned duel therefore disappears on its own rather
 * than accumulating forever.
 *
 * <p>The compare-and-set runs as a Lua script so the version check and the write are one atomic step. Keeping
 * the version in its own hash field rather than parsing it back out of the JSON keeps the script free of
 * {@code cjson}, and with it free of that library's number-precision surprises.
 */
@Component
public class RedisGameStateStore implements GameStateStore {

    private static final String KEY_PREFIX = "cardwar:duel:";
    private static final String FIELD_STATE = "state";
    private static final String FIELD_VERSION = "version";
    private static final String FIELD_STARTED_AT = "startedAt";

    private static final RedisScript<Long> COMPARE_AND_SET = new DefaultRedisScript<>(
            """
            local stored = redis.call('HGET', KEYS[1], 'version')
            if stored == false then
                if ARGV[1] ~= '-1' then return 0 end
            elseif stored ~= ARGV[1] then
                return 0
            end
            redis.call('HSET', KEYS[1], 'version', ARGV[2], 'state', ARGV[3], 'startedAt', ARGV[4])
            redis.call('PEXPIRE', KEYS[1], ARGV[5])
            return 1
            """,
            Long.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final Duration ttl;

    public RedisGameStateStore(
            StringRedisTemplate redis, ObjectMapper mapper, @Value("${cardwar.duel.state-ttl}") Duration ttl) {
        this.redis = redis;
        this.mapper = mapper;
        this.ttl = ttl;
    }

    @Override
    public Optional<StoredDuel> find(DuelId duelId) {
        List<Object> fields = redis.opsForHash().multiGet(key(duelId), List.of(FIELD_STATE, FIELD_STARTED_AT));
        Object state = fields.get(0);
        Object startedAt = fields.get(1);
        if (state == null || startedAt == null) {
            return Optional.empty();
        }
        return Optional.of(new StoredDuel(read((String) state), Instant.parse((String) startedAt)));
    }

    @Override
    public void save(StoredDuel duel, long expectedVersion) {
        Long applied = redis.execute(
                COMPARE_AND_SET,
                List.of(key(duel.state().duelId())),
                Long.toString(expectedVersion),
                Long.toString(duel.state().version()),
                write(duel.state()),
                duel.startedAt().toString(),
                Long.toString(ttl.toMillis()));
        if (applied == null || applied == 0L) {
            throw new ConflictException("The duel moved on while this move was being made");
        }
    }

    @Override
    public void delete(DuelId duelId) {
        redis.delete(key(duelId));
    }

    private static String key(DuelId duelId) {
        return KEY_PREFIX + duelId.value();
    }

    private String write(DuelState state) {
        return mapper.writeValueAsString(state);
    }

    private DuelState read(String json) {
        try {
            return mapper.readValue(json, DuelState.class);
        } catch (JacksonException ex) {
            // A state we cannot read is a state we cannot play on; failing loudly beats resuming a half-duel.
            throw new IllegalStateException("Stored duel state could not be read", ex);
        }
    }
}
