package cardwar.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * The API is stateless and bearer-token authenticated, so no session is created and CSRF protection is off —
 * there is no ambient cookie for a third-party page to ride on.
 *
 * <p>Everything not listed as public requires authentication, so an endpoint added later is protected unless
 * someone deliberately opens it.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    private static final String[] PUBLIC_PATHS = {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/telegram",
        // Telegram's servers carry no player token; the controller checks the webhook secret header instead.
        "/api/v1/telegram/webhook",
        "/actuator/health",
        "/actuator/health/**",
        "/actuator/info",
        // Scraped by Grafana Alloy over the compose network, which has no token; nginx refuses it from outside.
        "/actuator/prometheus",
        "/v3/api-docs/**",
        "/swagger-ui.html",
        "/swagger-ui/**"
    };

    /**
     * Only in a servlet web application. A one-shot run with the web server disabled ({@code make migrate}) has
     * no {@code HttpSecurity} to build a chain from, and nothing to protect.
     */
    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http, JwtAuthenticationFilter jwtAuthenticationFilter, RateLimitFilter rateLimitFilter)
            throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.requestMatchers(PUBLIC_PATHS)
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                // A missing or bad credential is a 401, not a redirect to a login form that does not exist.
                .exceptionHandling(handling ->
                        handling.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                // Authentication first, so the rate limiter can key on the principal rather than falling
                // back to an address that a NAT or the reverse proxy may share between many players.
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(rateLimitFilter, JwtAuthenticationFilter.class)
                .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
