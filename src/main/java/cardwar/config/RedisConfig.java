package cardwar.config;

import cardwar.session.event.DuelChannels;
import cardwar.session.event.DuelStreams;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/**
 * The one place outside the state store and the event channel that is allowed to see Redis types, because
 * wiring a listener container is exactly what configuration is for.
 */
@Configuration
public class RedisConfig {

    /**
     * Switched off with {@code cardwar.events.enabled=false} for one-shot runs such as {@code make migrate}: the
     * container's subscription thread is the one thing that would otherwise keep a web-less JVM alive.
     */
    @Bean
    @ConditionalOnProperty(name = "cardwar.events.enabled", havingValue = "true", matchIfMissing = true)
    RedisMessageListenerContainer duelEventListenerContainer(
            RedisConnectionFactory connectionFactory, DuelStreams streams) {
        var container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(streams, new PatternTopic(DuelChannels.PATTERN));
        return container;
    }
}
