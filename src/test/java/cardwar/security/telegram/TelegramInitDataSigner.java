package cardwar.security.telegram;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Builds initData the way Telegram does, so tests exercise the verifier against real signatures rather than a
 * stubbed check. Test-only: nothing in production ever signs initData.
 */
public final class TelegramInitDataSigner {

    /** Shaped like a real bot token and obviously not one. */
    public static final String BOT_TOKEN = "123456789:TEST-ONLY-not-a-real-bot-token";

    private TelegramInitDataSigner() {}

    public static String sign(String botToken, Map<String, String> fields) {
        var sorted = new TreeMap<>(fields);
        String dataCheckString = sorted.entrySet().stream()
                .map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.joining("\n"));
        byte[] secret = hmac("WebAppData".getBytes(StandardCharsets.UTF_8), botToken);
        String hash = HexFormat.of().formatHex(hmac(secret, dataCheckString));
        sorted.put("hash", hash);
        return sorted.entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }

    /** A signed payload for one user, authenticated {@code authDate} (epoch seconds). */
    public static String forUser(String botToken, long userId, String firstName, long authDate) {
        String user = "{\"id\":" + userId + ",\"first_name\":\"" + firstName
                + "\",\"last_name\":\"Tester\",\"username\":\"u" + userId + "\",\"language_code\":\"en\"}";
        return sign(
                botToken,
                Map.of(
                        "user",
                        user,
                        "auth_date",
                        Long.toString(authDate),
                        "query_id",
                        "AAHdF6IQAAAAAN0XohDhrOrc",
                        "signature",
                        "c2lnbmF0dXJlLW5vdC1jaGVja2Vk"));
    }

    private static byte[] hmac(byte[] key, String data) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
