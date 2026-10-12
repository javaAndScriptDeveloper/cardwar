package cardwar;

import cardwar.monetization.grant.StreakSource;
import cardwar.support.MutableClock;
import cardwar.support.StubStreakSource;
import com.redis.testcontainers.RedisContainer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Provides the container-backed infrastructure used by tests: Postgres for finished results and Redis for
 * in-progress duel state and the event channel. The {@link ServiceConnection} annotation wires each container's
 * connection details into Spring Boot automatically — no manual {@code spring.datasource.*} needed.
 *
 * <p>Also the two knobs the shared context exposes to tests, so that time- and streak-dependent rules can be driven
 * without a second context: a clock a test can pin, and a streak source a test can set per player.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock();
    }

    @Bean
    @Primary
    StubStreakSource stubStreakSource(ObjectProvider<StreakSource> sources) {
        return new StubStreakSource(sources);
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse("postgres:17-alpine"));
    }

    @Bean
    @ServiceConnection("redis")
    RedisContainer redisContainer() {
        return new RedisContainer(DockerImageName.parse("redis:7-alpine"));
    }
}
