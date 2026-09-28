package cardwar.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Extracts the bearer credential and hands it to a {@link PrincipalResolver}. The filter knows nothing about
 * JWTs itself — that is what keeps a second identity provider a matter of adding a resolver.
 *
 * <p>A missing or unusable credential leaves the context anonymous rather than failing here; the authorization
 * rules decide whether that is acceptable for the requested path.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final PrincipalResolver principalResolver;

    public JwtAuthenticationFilter(PrincipalResolver principalResolver) {
        this.principalResolver = principalResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            principalResolver
                    .resolve(header.substring(BEARER_PREFIX.length()).trim())
                    .ifPresent(identity -> {
                        var authentication = new UsernamePasswordAuthenticationToken(
                                identity, null, List.of(new SimpleGrantedAuthority("ROLE_PLAYER")));
                        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(authentication);
                    });
        }
        chain.doFilter(request, response);
    }
}
