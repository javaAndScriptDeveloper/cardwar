package cardwar.account.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.UUID;

/**
 * The public face of an account — no credential material, ever. {@code handle} (the Telegram {@code @username}) and
 * {@code photoUrl} exist only for Telegram accounts that have them, and are left out of the JSON otherwise.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlayerSummary(UUID id, String username, String displayName, String handle, String photoUrl) {}
