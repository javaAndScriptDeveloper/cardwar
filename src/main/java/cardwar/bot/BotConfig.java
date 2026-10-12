package cardwar.bot;

import cardwar.bot.client.RestTelegramBotApi;
import cardwar.bot.client.TelegramBotApi;
import cardwar.security.telegram.TelegramProperties;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** The reply is sent inside the webhook request, so its timeouts are short: Telegram waits on us meanwhile. */
@Configuration(proxyBeanMethods = false)
public class BotConfig {

    @Bean
    TelegramBotApi telegramBotApi(BotProperties bot, TelegramProperties telegram) {
        var requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(3));
        requests.setReadTimeout(Duration.ofSeconds(5));
        return new RestTelegramBotApi(RestClient.builder().requestFactory(requests), bot.apiUrl(), telegram.botToken());
    }
}
