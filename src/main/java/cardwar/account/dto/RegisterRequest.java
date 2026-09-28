package cardwar.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Registration payload. Constraints are enforced here so invalid input never reaches the service. */
public record RegisterRequest(
        @NotBlank
                @Size(min = 3, max = 32)
                @Pattern(
                        regexp = "^[a-zA-Z0-9_.-]+$",
                        message = "may contain only letters, digits, underscore, dot and hyphen")
                String username,
        @NotBlank @Size(min = 10, max = 128) String password,
        @Size(max = 64) String displayName) {}
