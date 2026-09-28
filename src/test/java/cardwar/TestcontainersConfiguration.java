package cardwar;

import com.redis.testcontainers.RedisContainer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Provides the container-backed infrastructure used by tests: Postgres for finished results and Redis for
 * in-progress duel state and the event channel. The {@link ServiceConnection} annotation wires each container's
 * connection details into Spring Boot automatically — no manual {@code spring.datasource.*} needed.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

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
