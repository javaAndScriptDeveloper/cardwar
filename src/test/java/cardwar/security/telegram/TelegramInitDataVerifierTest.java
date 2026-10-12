package cardwar.security.telegram;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class TelegramInitDataVerifierTest {

    private static final Instant NOW = Instant.parse("2026-10-12T12:00:00Z");
    private static final String TOKEN = TelegramInitDataSigner.BOT_TOKEN;

    private final TelegramInitDataVerifier verifier =
            new TelegramInitDataVerifier(TOKEN, Duration.ofHours(1), Clock.fixed(NOW, ZoneOffset.UTC));

    private static String valid() {
        return TelegramInitDataSigner.forUser(
                TOKEN, 42L, "Alice", NOW.minusSeconds(60).getEpochSecond());
    }

    @Test
    void acceptsAPayloadSignedWithTheBotToken() {
        assertThat(verifier.verify(valid()))
                .contains(new TelegramInitDataVerifier.TelegramUser(42L, "Alice Tester", "u42", null));
    }

    @Test
    void rejectsAPayloadSignedWithAnotherBotsToken() {
        String foreign = TelegramInitDataSigner.forUser("987654321:another-bot", 42L, "Alice", NOW.getEpochSecond());

        assertThat(verifier.verify(foreign)).isEmpty();
    }

    @Test
    void rejectsATamperedField() {
        String tampered = valid().replace("%22id%22%3A42", "%22id%22%3A43");

        assertThat(tampered).isNotEqualTo(valid());
        assertThat(verifier.verify(tampered)).isEmpty();
    }

    @Test
    void rejectsAStaleAuthDate() {
        String stale = TelegramInitDataSigner.forUser(
                TOKEN, 42L, "Alice", NOW.minus(Duration.ofHours(2)).getEpochSecond());

        assertThat(verifier.verify(stale)).isEmpty();
    }

    @Test
    void rejectsAnAuthDateFarInTheFuture() {
        String future = TelegramInitDataSigner.forUser(
                TOKEN, 42L, "Alice", NOW.plus(Duration.ofMinutes(10)).getEpochSecond());

        assertThat(verifier.verify(future)).isEmpty();
    }

    @Test
    void rejectsAPayloadWithoutAHash() {
        String unsigned = valid().replaceAll("&?hash=[0-9a-f]+", "");

        assertThat(verifier.verify(unsigned)).isEmpty();
    }

    @Test
    void rejectsGarbageAndBlankInput() {
        assertThat(verifier.verify("not a query string")).isEmpty();
        assertThat(verifier.verify("")).isEmpty();
        assertThat(verifier.verify(null)).isEmpty();
        assertThat(verifier.verify("a=1&a=2&hash=00")).isEmpty();
    }

    @Test
    void rejectsEverythingWhenNoBotTokenIsConfigured() {
        var unconfigured = new TelegramInitDataVerifier("", Duration.ofHours(1), Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(unconfigured.verify(valid())).isEmpty();
    }

    @Test
    void aUserWithoutALastNameIsNamedByTheFirstNameAlone() {
        String payload = TelegramInitDataSigner.sign(
                TOKEN,
                java.util.Map.of(
                        "user",
                        "{\"id\":7,\"first_name\":\"Solo\"}",
                        "auth_date",
                        Long.toString(NOW.getEpochSecond())));

        assertThat(verifier.verify(payload))
                .contains(new TelegramInitDataVerifier.TelegramUser(7L, "Solo", null, null));
    }

    private TelegramInitDataVerifier.TelegramUser userFrom(String userJson) {
        return verifier.verify(TelegramInitDataSigner.forUserJson(TOKEN, userJson, NOW.getEpochSecond()))
                .orElseThrow();
    }

    @Test
    void readsTheHandleAndAnHttpsPhoto() {
        var user = userFrom("{\"id\":8,\"first_name\":\"Ann\",\"username\":\"ann_k\","
                + "\"photo_url\":\"https://t.me/i/userpic/320/ann.svg\"}");

        assertThat(user.handle()).isEqualTo("ann_k");
        assertThat(user.photoUrl()).isEqualTo("https://t.me/i/userpic/320/ann.svg");
    }

    @Test
    void dropsAPhotoThatIsNotHttpsOrTooLong() {
        assertThat(userFrom("{\"id\":8,\"first_name\":\"A\",\"photo_url\":\"http://t.me/i/userpic/a.svg\"}")
                        .photoUrl())
                .isNull();
        assertThat(userFrom("{\"id\":8,\"first_name\":\"A\",\"photo_url\":\"javascript:alert(1)\"}")
                        .photoUrl())
                .isNull();
        assertThat(userFrom("{\"id\":8,\"first_name\":\"A\",\"photo_url\":\"https://t.me/" + "x".repeat(600) + "\"}")
                        .photoUrl())
                .isNull();
    }

    @Test
    void dropsAHandleTelegramWouldNeverIssue() {
        assertThat(userFrom("{\"id\":8,\"first_name\":\"A\",\"username\":\"not a handle\"}")
                        .handle())
                .isNull();
        assertThat(userFrom("{\"id\":8,\"first_name\":\"A\",\"username\":\"" + "a".repeat(33) + "\"}")
                        .handle())
                .isNull();
    }
}
