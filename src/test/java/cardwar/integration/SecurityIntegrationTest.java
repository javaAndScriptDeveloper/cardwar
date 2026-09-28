package cardwar.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cardwar.security.JwtProperties;
import io.jsonwebtoken.Jwts;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * The authentication boundary from the outside: every way a caller might try to be somebody they are not, and the
 * one answer each attempt gets.
 */
class SecurityIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper mapper;

    @Autowired
    JwtProperties jwtProperties;

    ApiDriver api;
    ApiDriver.Player alice;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiDriver(mvc, mapper);
        alice = api.register(ApiDriver.uniqueUsername("alice"));
    }

    @Test
    void protectedEndpointWithoutACredentialIs401() throws Exception {
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/collection")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/duels")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"opponentUsername\":\"x\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tamperedTokenIs401() throws Exception {
        String token = alice.token();
        // Flip a character in the middle of the signature segment. Not the last one: a base64url decoder ignores
        // its padding bits, so changing only those leaves the decoded signature intact and the token valid.
        int signatureStart = token.lastIndexOf('.') + 1;
        int target = signatureStart + (token.length() - signatureStart) / 2;
        char original = token.charAt(target);
        String tampered = token.substring(0, target) + (original == 'A' ? 'B' : 'A') + token.substring(target + 1);

        mvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + tampered))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void forgedSubjectSignedWithTheWrongKeyIs401() throws Exception {
        var wrongKey = new SecretKeySpec(new byte[32], "HmacSHA256");
        String forged = Jwts.builder()
                .issuer("cardwar")
                .subject(alice.id().toString())
                .claim("usr", alice.username())
                .expiration(Date.from(Instant.now().plusSeconds(600)))
                .signWith(wrongKey)
                .compact();

        mvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredTokenIs401() throws Exception {
        var realKey = new SecretKeySpec(Base64.getDecoder().decode(jwtProperties.secret()), "HmacSHA256");
        String expired = Jwts.builder()
                .issuer("cardwar")
                .subject(alice.id().toString())
                .claim("usr", alice.username())
                .issuedAt(Date.from(Instant.now().minusSeconds(7200)))
                .expiration(Date.from(Instant.now().minusSeconds(3600)))
                .signWith(realKey)
                .compact();

        mvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + expired))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void playerIdentifierInTheRequestBodyIsIgnored() throws Exception {
        ApiDriver.Player bob = api.register(ApiDriver.uniqueUsername("bob"));
        UUID forgedId = UUID.randomUUID();

        // The duel creation payload only knows an opponent username; extra identity fields are silently dropped
        // and the acting player is whoever the token says it is.
        mvc.perform(post("/api/v1/duels")
                        .headers(ApiDriver.bearer(alice))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(api.json(Map.of(
                                "opponentUsername", bob.username(),
                                "you", forgedId.toString(),
                                "playerId", forgedId.toString(),
                                "challengerId", forgedId.toString()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.you").value(alice.id().toString()))
                .andExpect(jsonPath("$.opponent").value(bob.id().toString()));
    }

    @Test
    void publicEndpointsNeedNoCredential() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
    }

    @Test
    void unexpectedErrorsDoNotLeakInternals() throws Exception {
        // A well-formed request against a duel that does not exist is a 404 problem detail, not a stack trace.
        mvc.perform(get("/api/v1/duels/{id}", UUID.randomUUID()).headers(ApiDriver.bearer(alice)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.stackTrace").doesNotExist());
    }
}
