package cardwar.wallet.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * {@code amount} and {@code streakDay} describe the next claim when {@code available}, or the one already made today
 * otherwise; {@code nextAt} is the next Kyiv midnight, present only when nothing can be claimed now.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DailyBonusView(boolean available, long amount, int streakDay, Instant nextAt) {}
