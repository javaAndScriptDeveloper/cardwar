package cardwar.bot.client;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RestTelegramBotApiTest {

    @Test
    void sendsAMessageWithOneWebAppButton() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        var api = new RestTelegramBotApi(builder, "https://api.telegram.example", "123:token");
        server.expect(requestTo("https://api.telegram.example/bot123:token/sendMessage"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(
                        content()
                                .json(
                                        """
                        {"chat_id": 42, "text": "hi",
                         "reply_markup": {"inline_keyboard": [[{"text": "Play",
                                                                "web_app": {"url": "https://x/app/"}}]]}}
                        """))
                .andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));

        api.sendMessage(42, "hi", "Play", "https://x/app/");

        server.verify();
    }

    @Test
    void aFailedSendIsSwallowedBecauseTelegramWouldOnlyRetryTheUpdate() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        var api = new RestTelegramBotApi(builder, "https://api.telegram.example", "123:token");
        server.expect(requestTo("https://api.telegram.example/bot123:token/sendMessage"))
                .andRespond(withServerError());

        api.sendMessage(42, "hi", "Play", "https://x/app/");

        server.verify();
    }
}
