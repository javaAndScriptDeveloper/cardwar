package cardwar.metrics;

import cardwar.engine.GameCommand;
import cardwar.engine.Outcome;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The business counters behind the Grafana business dashboard (docs/observability.md). Every label value comes from
 * a closed set (an enum here or an engine enum), never from a player, duel or invite id, so the number of series
 * stays fixed however many people play.
 */
@Component
public class GameMetrics {

    public enum SignIn {
        REGISTER,
        PASSWORD,
        TELEGRAM
    }

    public enum StartMode {
        DIRECT,
        INVITE
    }

    public enum MoveOutcome {
        OK,
        REJECTED,
        CONFLICT
    }

    public enum InviteEvent {
        CREATED,
        REUSED,
        ACCEPTED
    }

    public enum BotOutcome {
        REPLIED,
        IGNORED,
        REJECTED,
        FAILED
    }

    private final MeterRegistry registry;

    public GameMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    /** Counted after the transaction commits, so a registration that rolls back is not a sign-in. */
    public void signIn(SignIn method) {
        afterCommit(() -> counter("cardwar.signins", "Successful sign-ins and registrations", "method", label(method))
                .increment());
    }

    public void duelStarted(StartMode mode) {
        counter("cardwar.duels.started", "Duels started", "mode", label(mode)).increment();
    }

    public void duelFinished(Outcome outcome) {
        Counter.builder("cardwar.duels.finished")
                .description("Duels that reached a result")
                .tag("result", outcome.draw() ? "draw" : "decisive")
                .tag("reason", label(outcome.reason()))
                .register(registry)
                .increment();
    }

    public void move(GameCommand command, MoveOutcome outcome) {
        Counter.builder("cardwar.moves")
                .description("Moves submitted, by type and what became of them")
                .tag("type", typeOf(command))
                .tag("outcome", label(outcome))
                .register(registry)
                .increment();
    }

    public void invite(InviteEvent event) {
        counter("cardwar.invites", "Invite lifecycle events", "event", label(event))
                .increment();
    }

    public void botUpdate(BotOutcome outcome) {
        counter("cardwar.bot.updates", "Telegram bot webhook updates", "outcome", label(outcome))
                .increment();
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    private Counter counter(String name, String description, String tag, String value) {
        return Counter.builder(name).description(description).tag(tag, value).register(registry);
    }

    private static String typeOf(GameCommand command) {
        return switch (command) {
            case GameCommand.Attack ignored -> "attack";
            case GameCommand.Defend ignored -> "defend";
            case GameCommand.TakeCards ignored -> "take";
            case GameCommand.EndAttack ignored -> "end_attack";
        };
    }

    private static String label(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }
}
