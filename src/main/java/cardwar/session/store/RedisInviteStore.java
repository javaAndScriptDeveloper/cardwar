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
 *
 * <p>A per-player pointer key names the player's latest invite and expires with it; it is how a reopened Mini App
 * finds the invite it was waiting on, and how a second "create" hands back the same one.
 */
@Component
public class RedisInviteStore implements InviteStore {

    private static final String KEY_PREFIX = "cardwar:invite:";

    /** Returns the id of the creator's still-pending invite if there is one, else stores the new one. */
    private static final RedisScript<String> CREATE = new DefaultRedisScript<>(
            """
            local current = redis.call('GET', KEYS[1])
            if current and redis.call('HGET', ARGV[5] .. current, 'status') == 'PENDING' then
                return current
            end
            redis.call('HSET', KEYS[2], 'creator', ARGV[1], 'status', 'PENDING', 'expiresAt', ARGV[2])
            redis.call('PEXPIRE', KEYS[2], ARGV[3])
            redis.call('SET', KEYS[1], ARGV[4], 'PX', ARGV[3])
            return ARGV[4]
            """,
            String.class);

    /** Deletes the player's invite only while nobody has accepted it: an accepted one still tells its creator the duel. */
    private static final RedisScript<Long> CANCEL_PENDING = new DefaultRedisScript<>(
            """
            local current = redis.call('GET', KEYS[1])
            if not current then return 0 end
            redis.call('DEL', KEYS[1])
            if redis.call('HGET', ARGV[1] .. current, 'status') == 'PENDING' then
                redis.call('DEL', ARGV[1] .. current)
                return 1
            end
            return 0
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
        String stored = redis.execute(
                CREATE,
                List.of(pointerKey(creator), key(inviteId)),
                creator.toString(),
                expiresAt.toString(),
                Long.toString(ttl.toMillis()),
                inviteId.toString(),
                KEY_PREFIX);
        if (inviteId.toString().equals(stored)) {
            return new StoredInvite(inviteId, creator, StoredInvite.Status.PENDING, null, null, expiresAt);
        }
        // An existing invite can expire between the script and this read; a fresh one is then the right answer.
        return find(UUID.fromString(stored)).orElseGet(() -> create(creator));
    }

    @Override
    public Optional<StoredInvite> findPending(UUID creator) {
        String current = redis.opsForValue().get(pointerKey(creator));
        if (current == null) {
            return Optional.empty();
        }
        return find(UUID.fromString(current)).filter(invite -> invite.status() == StoredInvite.Status.PENDING);
    }

    @Override
    public void cancelPending(UUID creator) {
        redis.execute(CANCEL_PENDING, List.of(pointerKey(creator)), KEY_PREFIX);
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

    private static String pointerKey(UUID player) {
        return "cardwar:player:" + player + ":invite";
    }

    private static String key(UUID inviteId) {
        return KEY_PREFIX + inviteId;
    }
}
