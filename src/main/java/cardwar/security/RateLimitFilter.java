package cardwar.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-caller request throttling.
 *
 * <p>In-memory and therefore per-instance and reset by a restart — which is all this phase claims: a hook
 * against casual abuse. Bucket4j swaps to a Redis-backed store without this filter changing shape.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final String AUTH_PATH_PREFIX = "/api/v1/auth/";

    private final Map<String, Bucket> generalBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> authBuckets = new ConcurrentHashMap<>();
    private final RateLimitProperties properties;

    public RateLimitFilter(RateLimitProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean authEndpoint = request.getRequestURI().startsWith(AUTH_PATH_PREFIX);
        Map<String, Bucket> buckets = authEndpoint ? authBuckets : generalBuckets;
        Bucket bucket = buckets.computeIfAbsent(callerKey(request, authEndpoint), key -> newBucket(authEndpoint));

        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter()
                .write("{\"type\":\"about:blank\",\"title\":\"Too Many Requests\",\"status\":429,"
                        + "\"detail\":\"Rate limit exceeded. Try again shortly.\"}");
    }

    /**
     * Keyed on the authenticated principal where there is one, and on the client address otherwise. Auth
     * endpoints are always keyed on the address — that is the whole point of throttling them.
     */
    private static String callerKey(HttpServletRequest request, boolean authEndpoint) {
        if (!authEndpoint) {
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.getPrincipal() instanceof PlayerIdentity identity) {
                return "player:" + identity.playerId();
            }
        }
        return "addr:" + request.getRemoteAddr();
    }

    private Bucket newBucket(boolean authEndpoint) {
        long capacity = authEndpoint ? properties.authCapacity() : properties.capacity();
        var period = authEndpoint ? properties.authRefillPeriod() : properties.refillPeriod();
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(capacity)
                        .refillGreedy(capacity, period)
                        .build())
                .build();
    }
}
