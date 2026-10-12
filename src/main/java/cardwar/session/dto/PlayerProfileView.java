package cardwar.session.dto;

import cardwar.account.dto.PlayerSummary;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * How another player is shown: the display name to read, the Telegram {@code @handle} and photo when they have them.
 * {@code username} stays for clients that still key on it.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlayerProfileView(String username, String displayName, String handle, String photoUrl) {

    public static PlayerProfileView of(PlayerSummary summary) {
        return new PlayerProfileView(summary.username(), summary.displayName(), summary.handle(), summary.photoUrl());
    }
}
