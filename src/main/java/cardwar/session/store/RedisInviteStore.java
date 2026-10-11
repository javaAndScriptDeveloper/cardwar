package cardwar.session.store;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * One hash per invite with a TTL set at creation and never refreshed: an invite's lifetime is fixed when it is
 * shared. Acceptance is a Lua script so the status check and the write are one atomic step.
 */
@Component
public class RedisInviteStore implements InviteStore {

    private static final String KEY_PREFIX = "cardwar:invite:";

    private static final RedisScript<Long> CREATE = new DefaultRedisScript<>(
            """
            redis.call('HSET', KEYS[1], 'creator', ARGV[1], 'status', 'PENDING', 'expiresAt', ARGV[2])
            redis.call('PEXPIRE', KEYS[1], ARGV[3])
            return 1
            """,
            Long.class);

    private static final RedisScript<Long> CLAIM = new DefaultRedisScript<>(
            """
            local status = redis.call('HGET', KEYS[1], 'status')
            if status == false then return 0 end
            if status ~= 'PENDING' then return -1 end
            redis.call('HSET', KEYS[1], 'status', 'ACCEPTED', 'acceptor', ARGV[1], 'duelId', ARGV[2])
            return 1
            """,
            Long.class);

    private final StringRedisTemplate redis;
    private final Duration ttl;

    public RedisInviteStore(StringRedisTemplate redis, @Value("${cardwar.duel.invite-ttl}") Duration ttl) {
        this.redis = redis;
        this.ttl = ttl;
    }

    @Override
    public StoredInvite create(UUID creator) {
        var inviteId = UUID.randomUUID();
        Instant expiresAt = Instant.now().plus(ttl);
        redis.execute(
                CREATE,
                List.of(key(inviteId)),
                creator.toString(),
                expiresAt.toString(),
                Long.toString(ttl.toMillis()));
        return new StoredInvite(inviteId, creator, StoredInvite.Status.PENDING, null, null, expiresAt);
    }

    @Override
    public Optional<StoredInvite> find(UUID inviteId) {
        Map<Object, Object> fields = redis.opsForHash().entries(key(inviteId));
        if (fields.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new StoredInvite(
                inviteId,
                UUID.fromString((String) fields.get("creator")),
                StoredInvite.Status.valueOf((String) fields.get("status")),
                uuidOrNull(fields.get("acceptor")),
                uuidOrNull(fields.get("duelId")),
                Instant.parse((String) fields.get("expiresAt"))));
    }

    @Override
    public ClaimResult claim(UUID inviteId, UUID acceptor, UUID duelId) {
        Long result = redis.execute(CLAIM, List.of(key(inviteId)), acceptor.toString(), duelId.toString());
        if (result == null || result == 0L) {
            return ClaimResult.MISSING;
        }
        return result == 1L ? ClaimResult.CLAIMED : ClaimResult.ALREADY_ACCEPTED;
    }

    private static UUID uuidOrNull(Object value) {
        return value == null ? null : UUID.fromString((String) value);
    }

    private static String key(UUID inviteId) {
        return KEY_PREFIX + inviteId;
    }
}
