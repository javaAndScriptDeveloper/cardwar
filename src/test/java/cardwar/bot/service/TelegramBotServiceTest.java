package cardwar.bot.service;

import static org.assertj.core.api.Assertions.assertThat;

import cardwar.bot.BotProperties;
import cardwar.bot.client.TelegramBotApi;
import cardwar.metrics.GameMetrics;
import cardwar.monetization.service.StarsService;
import cardwar.security.telegram.TelegramProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class TelegramBotServiceTest {

    record Sent(long chatId, String text, String buttonText, String buttonUrl) {}

    final List<Sent> sent = new ArrayList<>();
    final TelegramBotApi api =
            (chatId, text, buttonText, buttonUrl) -> sent.add(new Sent(chatId, text, buttonText, buttonUrl));
    final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    final GameMetrics metrics = new GameMetrics(registry);
    final TelegramBotService bot = new TelegramBotService(
            new TelegramProperties("123:token", null),
            new BotProperties("https://cardwar.example/app/", "https://api.telegram.example"),
            api,
            metrics,
            new org.springframework.beans.factory.support.StaticListableBeanFactory()
                    .getBeanProvider(StarsService.class));

    private static JsonNode update(String chatType, String text) {
        return JsonMapper.builder()
                .build()
                .readTree(
                        """
                        {"update_id": 1, "message": {"message_id": 7, "chat": {"id": 42, "type": "%s"},
                         "from": {"id": 42, "first_name": "Ann"}, "text": "%s"}}
                        """
                                .formatted(chatType, text));
    }

    @Test
    void startGreetsAndOffersThePlayButton() {
        bot.handle(update("private", "/start"));

        assertThat(sent).singleElement().satisfies(reply -> {
            assertThat(reply.chatId()).isEqualTo(42);
            assertThat(reply.text()).contains("Play");
            assertThat(reply.buttonText()).isEqualTo("Play");
            assertThat(reply.buttonUrl()).isEqualTo("https://cardwar.example/app/");
        });
    }

    @Test
    void startWithAnInviteOffersToJoinThatDuel() {
        String invite = "1916ee93-b43f-4e8a-bc55-0459c2815751";

        bot.handle(update("private", "/start " + invite));

        assertThat(sent).singleElement().satisfies(reply -> {
            assertThat(reply.buttonText()).isEqualTo("Join the duel");
            assertThat(reply.buttonUrl()).isEqualTo("https://cardwar.example/app/?invite=" + invite);
        });
    }

    @Test
    void aMalformedStartPayloadGetsThePlainGreeting() {
        bot.handle(update("private", "/start <script>"));

        assertThat(sent).singleElement().extracting(Sent::buttonUrl).isEqualTo("https://cardwar.example/app/");
    }

    @Test
    void anyOtherPrivateMessageIsPointedAtThePlayButton() {
        bot.handle(update("private", "hello?"));

        assertThat(sent).singleElement().extracting(Sent::buttonText).isEqualTo("Play");
    }

    @Test
    void aStreakReminderNamesTheDaysAtStakeAndOpensTheApp() {
        bot.notifyStreak(42, 3);
        bot.notifyStreak(43, 5);
        bot.notifyStreak(44, 21);

        assertThat(sent).hasSize(3);
        assertThat(sent.get(0).chatId()).isEqualTo(42);
        assertThat(sent.get(0).text()).isEqualTo("🔥 Серія 3 дні згорить опівночі. Забери бонус");
        assertThat(sent.get(0).buttonText()).isEqualTo("Грати");
        assertThat(sent.get(0).buttonUrl()).isEqualTo("https://cardwar.example/app/");
        assertThat(sent.get(1).text()).startsWith("🔥 Серія 5 днів згорить");
        assertThat(sent.get(2).text()).startsWith("🔥 Серія 21 день згорить");
    }

    @Test
    void groupsAndNonMessageUpdatesAreIgnored() {
        bot.handle(update("group", "/start"));
        bot.handle(JsonMapper.builder().build().readTree("{\"update_id\": 2, \"my_chat_member\": {}}"));

        assertThat(sent).isEmpty();
    }

    @Test
    void theWebhookSecretIsDerivedFromTheTokenAndCheckedExactly() {
        String secret = bot.webhookSecret();

        assertThat(secret).matches("[0-9a-f]{64}");
        assertThat(bot.acceptsSecret(secret)).isTrue();
        assertThat(bot.acceptsSecret(secret.substring(1))).isFalse();
        assertThat(bot.acceptsSecret(null)).isFalse();
        var tokenless = new TelegramBotService(
                new TelegramProperties("", null),
                new BotProperties("https://x/app/", "https://y"),
                api,
                metrics,
                new org.springframework.beans.factory.support.StaticListableBeanFactory()
                        .getBeanProvider(StarsService.class));
        assertThat(tokenless.acceptsSecret(tokenless.webhookSecret())).isFalse();
    }

    @Test
    void outcomesAreCounted() {
        TelegramBotApi failing = (chatId, text, buttonText, buttonUrl) -> false;
        var unlucky = new TelegramBotService(
                new TelegramProperties("123:token", null),
                new BotProperties("https://cardwar.example/app/", "https://api.telegram.example"),
                failing,
                metrics,
                new org.springframework.beans.factory.support.StaticListableBeanFactory()
                        .getBeanProvider(StarsService.class));

        bot.handle(update("private", "/start"));
        bot.handle(update("group", "/start"));
        unlucky.handle(update("private", "/start"));
        bot.acceptsSecret("nope");

        assertThat(registry.get("cardwar.bot.updates")
                        .tag("outcome", "replied")
                        .counter()
                        .count())
                .isEqualTo(1);
        assertThat(registry.get("cardwar.bot.updates")
                        .tag("outcome", "ignored")
                        .counter()
                        .count())
                .isEqualTo(1);
        assertThat(registry.get("cardwar.bot.updates")
                        .tag("outcome", "failed")
                        .counter()
                        .count())
                .isEqualTo(1);
        assertThat(registry.get("cardwar.bot.updates")
                        .tag("outcome", "rejected")
                        .counter()
                        .count())
                .isEqualTo(1);
    }
}
