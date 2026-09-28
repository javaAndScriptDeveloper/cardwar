package cardwar.account.controller;

import cardwar.account.dto.AuthResponse;
import cardwar.account.dto.LoginRequest;
import cardwar.account.dto.RegisterRequest;
import cardwar.account.service.AccountService;
import cardwar.exception.ApplicationException;
import cardwar.security.JwtService;
import cardwar.security.PlayerIdentity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Registration and login. Neither endpoint ever echoes a password or a hash back to the caller. */
@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "Account registration and bearer-token issue")
public class AuthController {

    private final AccountService accounts;
    private final JwtService jwt;

    public AuthController(AccountService accounts, JwtService jwt) {
        this.accounts = accounts;
        this.jwt = jwt;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an account and receive a token")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        PlayerIdentity identity = accounts.register(request.username(), request.password(), request.displayName());
        return tokenFor(identity);
    }

    /**
     * A failed login is a single generic 401 whether the username is unknown or the password is wrong: telling
     * the two apart would turn this endpoint into a username enumerator.
     */
    @PostMapping("/login")
    @Operation(summary = "Exchange credentials for a bearer token")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return accounts.authenticate(request.username(), request.password())
                .map(this::tokenFor)
                .orElseThrow(() -> new ApplicationException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
    }

    private AuthResponse tokenFor(PlayerIdentity identity) {
        JwtService.IssuedToken issued = jwt.issue(identity);
        return new AuthResponse(identity.playerId(), identity.username(), issued.token(), issued.expiresAt());
    }
}
