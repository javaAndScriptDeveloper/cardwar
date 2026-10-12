package cardwar.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Background jobs: the abandoned-stake sweep. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
public class SchedulingConfig {}
