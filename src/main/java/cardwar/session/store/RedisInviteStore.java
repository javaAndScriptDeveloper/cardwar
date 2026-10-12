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
 *
 * <p>A challenge also gets a record of its own that lives a day, and a per-sender sorted set of them: the invite
 * expires within minutes, but its sender should still see that it was accepted, declined or left to expire.
 */
@Component
public class RedisInviteStore implements InviteStore {

    private static final String KEY_PREFIX = "cardwar:invite:";

    /**
     * Returns the id of the creator's still-pending invite at the same stake if there is one; a pending invite at
     * another stake is withdrawn; otherwise the new one is stored.
     */
    private static final RedisScript<String> CREATE = new DefaultRedisScript<>(
            """
            local current = redis.call('GET', KEYS[1])
            if current and redis.call('HGET', ARGV[5] .. current, 'status') == 'PENDING' then
                local stake = redis.call('HGET', ARGV[5] .. current, 'stake') or '0'
                local invitee = redis.call('HGET', ARGV[5] .. current, 'invitee') or ''
                if stake == ARGV[6] and invitee == ARGV[7] then
                    return current
                end
                redis.call('DEL', ARGV[5] .. current)
            end
            redis.call('HSET', KEYS[2], 'creator', ARGV[1], 'status', 'PENDING', 'expiresAt', ARGV[2], 'stake', ARGV[6],
                'invitee', ARGV[7])
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

    /** Keeps the challenge record in step, so the sender sees the answer after the invite itself is gone. */
    private static final RedisScript<Long> DECLINE = new DefaultRedisScript<>(
            """
            if redis.call('HGET', KEYS[1], 'status') ~= 'PENDING' then return 0 end
            redis.call('HSET', KEYS[1], 'status', 'DECLINED')
            if redis.call('EXISTS', KEYS[2]) == 1 then redis.call('HSET', KEYS[2], 'status', 'DECLINED') end
            return 1
            """,
            Long.class);

    private static final RedisScript<Long> CLAIM = new DefaultRedisScript<>(
            """
            local status = redis.call('HGET', KEYS[1], 'status')
            if status == false then return 0 end
            if status ~= 'PENDING' then return -1 end
            redis.call('HSET', KEYS[1], 'status', 'ACCEPTED', 'acceptor', ARGV[1], 'duelId', ARGV[2])
            if redis.call('EXISTS', KEYS[2]) == 1 then redis.call('HSET', KEYS[2], 'status', 'ACCEPTED') end
            return 1
            """,
            Long.class);

    /** How long a sender's challenges stay listed, and how many at most. */
    static final Duration CHALLENGE_HISTORY = Duration.ofDays(1);

    static final int CHALLENGE_HISTORY_SIZE = 20;

    private final StringRedisTemplate redis;
    private final Duration ttl;

    public RedisInviteStore(StringRedisTemplate redis, @Value("${cardwar.duel.invite-ttl}") Duration ttl) {
        this.redis = redis;
        this.ttl = ttl;
    }

    @Override
    public StoredInvite create(UUID creator, long stake, UUID invitee) {
        var inviteId = UUID.randomUUID();
        Instant createdAt = Instant.now();
        Instant expiresAt = createdAt.plus(ttl);
        String stored = redis.execute(
                CREATE,
                List.of(pointerKey(creator), key(inviteId)),
                creator.toString(),
                expiresAt.toString(),
                Long.toString(ttl.toMillis()),
                inviteId.toString(),
                KEY_PREFIX,
                Long.toString(stake),
                invitee == null ? "" : invitee.toString());
        if (inviteId.toString().equals(stored)) {
            if (invitee != null) {
                redis.opsForSet().add(incomingKey(invitee), inviteId.toString());
                redis.expire(incomingKey(invitee), ttl);
                remember(
                        new StoredChallenge(
                                inviteId, invitee, stake, createdAt, expiresAt, StoredChallenge.Outcome.WAITING),
                        creator);
            }
            return new StoredInvite(
                    inviteId, creator, StoredInvite.Status.PENDING, null, null, expiresAt, stake, invitee);
        }
        // An existing invite can expire between the script and this read; a fresh one is then the right answer.
        return find(UUID.fromString(stored)).orElseGet(() -> create(creator, stake, invitee));
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
                Instant.parse((String) fields.get("expiresAt")),
                fields.get("stake") == null ? 0 : Long.parseLong((String) fields.get("stake")),
                uuidOrNull(fields.get("invitee"))));
    }

    @Override
    public ClaimResult claim(UUID inviteId, UUID acceptor, UUID duelId) {
        Long result = redis.execute(
                CLAIM, List.of(key(inviteId), challengeKey(inviteId)), acceptor.toString(), duelId.toString());
        if (result == null || result == 0L) {
            return ClaimResult.MISSING;
        }
        return result == 1L ? ClaimResult.CLAIMED : ClaimResult.ALREADY_ACCEPTED;
    }

    @Override
    public java.util.List<StoredInvite> findIncoming(UUID invitee) {
        var members = redis.opsForSet().members(incomingKey(invitee));
        if (members == null) {
            return java.util.List.of();
        }
        var pending = new java.util.ArrayList<StoredInvite>();
        for (String member : members) {
            Optional<StoredInvite> invite = find(UUID.fromString(member));
            if (invite.isPresent() && invite.get().status() == StoredInvite.Status.PENDING) {
                pending.add(invite.get());
            } else {
                redis.opsForSet().remove(incomingKey(invitee), member);
            }
        }
        pending.sort(java.util.Comparator.comparing(StoredInvite::expiresAt).reversed());
        return pending;
    }

    @Override
    public boolean decline(UUID inviteId) {
        Long result = redis.execute(DECLINE, List.of(key(inviteId), challengeKey(inviteId)));
        return result != null && result == 1L;
    }

    @Override
    public List<StoredChallenge> findOutgoing(UUID creator) {
        String outgoing = outgoingKey(creator);
        double oldest = micros(Instant.now().minus(CHALLENGE_HISTORY));
        redis.opsForZSet().removeRangeByScore(outgoing, Double.NEGATIVE_INFINITY, oldest);
        var ids = redis.opsForZSet().reverseRange(outgoing, 0, CHALLENGE_HISTORY_SIZE - 1L);
        if (ids == null) {
            return List.of();
        }
        var challenges = new java.util.ArrayList<StoredChallenge>();
        for (String id : ids) {
            UUID inviteId = UUID.fromString(id);
            Map<Object, Object> fields = redis.opsForHash().entries(challengeKey(inviteId));
            if (fields.isEmpty()) {
                redis.opsForZSet().remove(outgoing, id);
                continue;
            }
            Instant expiresAt = Instant.parse((String) fields.get("expiresAt"));
            challenges.add(new StoredChallenge(
                    inviteId,
                    UUID.fromString((String) fields.get("invitee")),
                    Long.parseLong((String) fields.get("stake")),
                    Instant.parse((String) fields.get("createdAt")),
                    expiresAt,
                    outcome((String) fields.get("status"), inviteId)));
        }
        return challenges;
    }

    /** An answer is final; an unanswered challenge is waiting only while its invite can still be accepted. */
    private StoredChallenge.Outcome outcome(String recorded, UUID inviteId) {
        if ("ACCEPTED".equals(recorded) || "DECLINED".equals(recorded)) {
            return StoredChallenge.Outcome.valueOf(recorded);
        }
        boolean open = find(inviteId)
                .filter(invite -> invite.status() == StoredInvite.Status.PENDING)
                .filter(invite -> invite.expiresAt().isAfter(Instant.now()))
                .isPresent();
        return open ? StoredChallenge.Outcome.WAITING : StoredChallenge.Outcome.EXPIRED;
    }

    private void remember(StoredChallenge challenge, UUID creator) {
        String record = challengeKey(challenge.inviteId());
        redis.opsForHash()
                .putAll(
                        record,
                        Map.of(
                                "invitee", challenge.invitee().toString(),
                                "stake", Long.toString(challenge.stake()),
                                "createdAt", challenge.createdAt().toString(),
                                "expiresAt", challenge.expiresAt().toString(),
                                "status", "PENDING"));
        redis.expire(record, CHALLENGE_HISTORY);
        String outgoing = outgoingKey(creator);
        redis.opsForZSet().add(outgoing, challenge.inviteId().toString(), micros(challenge.createdAt()));
        redis.opsForZSet().removeRange(outgoing, 0, -CHALLENGE_HISTORY_SIZE - 1L);
        redis.expire(outgoing, CHALLENGE_HISTORY);
    }

    /** Microseconds keep two challenges sent within the same millisecond in order; a double holds them exactly. */
    private static double micros(Instant instant) {
        return instant.getEpochSecond() * 1_000_000.0 + instant.getNano() / 1_000;
    }

    private static String challengeKey(UUID inviteId) {
        return "cardwar:challenge:" + inviteId;
    }

    private static String outgoingKey(UUID creator) {
        return "cardwar:player:" + creator + ":outgoing";
    }

    private static String incomingKey(UUID invitee) {
        return "cardwar:player:" + invitee + ":incoming";
    }

    private static UUID uuidOrNull(Object value) {
        return value == null || ((String) value).isEmpty() ? null : UUID.fromString((String) value);
    }

    private static String pointerKey(UUID player) {
        return "cardwar:player:" + player + ":invite";
    }

    private static String key(UUID inviteId) {
        return KEY_PREFIX + inviteId;
    }
}
