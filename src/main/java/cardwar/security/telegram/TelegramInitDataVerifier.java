package cardwar.security.telegram;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Checks that a Mini App's {@code initData} was signed by Telegram for our bot, following
 * <a href="https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app">Telegram's
 * algorithm</a>: secret = HMAC-SHA256(key "WebAppData", bot token); hash = HMAC-SHA256(secret, every field except
 * {@code hash}, sorted, as {@code key=value} lines).
 *
 * <p>A signature alone proves origin, not freshness, so {@code auth_date} must also be recent: a leaked initData
 * string would otherwise be a permanent login. Nothing here logs the payload or the token.
 */
@Slf4j
public class TelegramInitDataVerifier {

    /** How far ahead of our clock an {@code auth_date} may be before it is treated as forged rather than skewed. */
    private static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(1);

    private static final ObjectMapper JSON = JsonMapper.builder().build();

    private final byte[] secret;
    private final Duration maxAge;
    private final Clock clock;

    public TelegramInitDataVerifier(String botToken, Duration maxAge, Clock clock) {
        this.secret = botToken == null || botToken.isBlank()
                ? null
                : hmac("WebAppData".getBytes(StandardCharsets.UTF_8), botToken);
        this.maxAge = maxAge;
        this.clock = clock;
        if (secret == null) {
            log.warn("No Telegram bot token configured: every Telegram sign-in will be rejected. "
                    + "Set TELEGRAM_BOT_TOKEN to enable it.");
        }
    }

    /**
     * The verified Telegram user. Only the id is an identity; the name, the {@code @handle} and the photo are cosmetic
     * and may be null (a user without a public username, or who hides their photo).
     */
    public record TelegramUser(long id, String displayName, String handle, String photoUrl) {}

    /** Telegram usernames are 5 to 32 of these; anything else did not come from Telegram and is not shown. */
    private static final Pattern HANDLE = Pattern.compile("[A-Za-z0-9_]{1,32}");

    /** Mirrors the {@code photo_url} column width. */
    private static final int MAX_PHOTO_URL = 512;

    /** Empty for anything not provably signed by Telegram for this bot within the allowed age. */
    public Optional<TelegramUser> verify(String initData) {
        if (secret == null || initData == null || initData.isBlank()) {
            return Optional.empty();
        }
        Map<String, String> fields = parse(initData);
        if (fields == null) {
            return Optional.empty();
        }
        String hash = fields.remove("hash");
        if (hash == null || !signatureMatches(fields, hash) || !fresh(fields.get("auth_date"))) {
            log.debug("Rejected Telegram initData");
            return Optional.empty();
        }
        return user(fields.get("user"));
    }

    private boolean signatureMatches(Map<String, String> fields, String hash) {
        String dataCheckString = new TreeMap<>(fields)
                .entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining("\n"));
        byte[] expected = hmac(secret, dataCheckString);
        byte[] presented;
        try {
            presented = HexFormat.of().parseHex(hash);
        } catch (IllegalArgumentException notHex) {
            return false;
        }
        // Constant-time: a byte-by-byte early exit would leak how much of a forged hash was right.
        return MessageDigest.isEqual(expected, presented);
    }

    private boolean fresh(String authDate) {
        if (authDate == null) {
            return false;
        }
        Instant issued;
        try {
            issued = Instant.ofEpochSecond(Long.parseLong(authDate));
        } catch (NumberFormatException notANumber) {
            return false;
        }
        Instant now = clock.instant();
        return !issued.isBefore(now.minus(maxAge)) && !issued.isAfter(now.plus(MAX_CLOCK_SKEW));
    }

    private static Optional<TelegramUser> user(String json) {
        if (json == null) {
            return Optional.empty();
        }
        try {
            JsonNode node = JSON.readTree(json);
            JsonNode id = node.get("id");
            if (id == null || !id.canConvertToLong()) {
                return Optional.empty();
            }
            String name = (text(node, "first_name") + " " + text(node, "last_name")).strip();
            return Optional.of(new TelegramUser(
                    id.asLong(), name, handle(text(node, "username")), photoUrl(text(node, "photo_url"))));
        } catch (JacksonException malformed) {
            return Optional.empty();
        }
    }

    private static String handle(String raw) {
        return HANDLE.matcher(raw).matches() ? raw : null;
    }

    /**
     * Only an absolute https URL is kept: the client puts it in an {@code img src}, so a {@code javascript:} or plain
     * http URL must never get that far, whoever signed it.
     */
    private static String photoUrl(String raw) {
        if (raw.isEmpty() || raw.length() > MAX_PHOTO_URL) {
            return null;
        }
        try {
            URI uri = new URI(raw);
            return "https".equals(uri.getScheme()) && uri.getHost() != null ? raw : null;
        } catch (URISyntaxException malformed) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }

    /** Null for anything that is not a well-formed query string with unique keys. */
    private static Map<String, String> parse(String initData) {
        var fields = new HashMap<String, String>();
        for (String pair : initData.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) {
                return null;
            }
            try {
                String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
                String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
                if (fields.put(key, value) != null) {
                    return null;
                }
            } catch (IllegalArgumentException badEscape) {
                return null;
            }
        }
        return fields;
    }

    private static byte[] hmac(byte[] key, String data) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HmacSHA256 is unavailable", ex);
        }
    }
}
