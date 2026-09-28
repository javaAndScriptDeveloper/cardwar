package cardwar.account.service;

import cardwar.account.domain.Player;
import cardwar.account.domain.PlayerProgress;
import cardwar.account.dto.PlayerSummary;
import cardwar.account.dto.ProgressView;
import cardwar.account.repository.PlayerProgressRepository;
import cardwar.account.repository.PlayerRepository;
import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.exception.NotFoundException;
import cardwar.security.PlayerIdentity;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Registration, credential checking and the progress counters other modules read. */
@Slf4j
@Service
public class AccountService {

    private final PlayerRepository players;
    private final PlayerProgressRepository progress;
    private final PasswordEncoder passwordEncoder;

    public AccountService(
            PlayerRepository players, PlayerProgressRepository progress, PasswordEncoder passwordEncoder) {
        this.players = players;
        this.progress = progress;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public PlayerIdentity register(String username, String rawPassword, String displayName) {
        if (players.existsByUsername(username)) {
            throw new ConflictException("Username is already taken");
        }
        var now = Instant.now();
        var player = new Player(
                UUID.randomUUID(),
                username,
                passwordEncoder.encode(rawPassword),
                displayName == null || displayName.isBlank() ? username : displayName,
                now);
        try {
            players.saveAndFlush(player);
        } catch (DataIntegrityViolationException raced) {
            // Two registrations for the same username in flight: the unique constraint is the arbiter.
            throw new ConflictException("Username is already taken");
        }
        progress.save(new PlayerProgress(player.getId(), now));
        log.info("Registered player {}", player.getId());
        return new PlayerIdentity(player.getId(), player.getUsername());
    }

    /**
     * Verifies credentials without revealing which half was wrong. The hash comparison runs even for an unknown
     * username so that response timing does not become a username oracle.
     */
    @Transactional(readOnly = true)
    public Optional<PlayerIdentity> authenticate(String username, String rawPassword) {
        Optional<Player> found = players.findByUsername(username);
        String hash = found.map(Player::getPasswordHash).orElse(DUMMY_HASH);
        boolean matches = passwordEncoder.matches(rawPassword, hash);
        if (found.isEmpty() || !matches) {
            log.debug("Failed authentication attempt");
            return Optional.empty();
        }
        return found.map(player -> new PlayerIdentity(player.getId(), player.getUsername()));
    }

    @Transactional(readOnly = true)
    public PlayerSummary summary(UUID playerId) {
        return players.findById(playerId)
                .map(player -> new PlayerSummary(player.getId(), player.getUsername(), player.getDisplayName()))
                .orElseThrow(() -> new NotFoundException("Player not found"));
    }

    @Transactional(readOnly = true)
    public boolean exists(UUID playerId) {
        return players.existsById(playerId);
    }

    @Transactional(readOnly = true)
    public UUID requireIdByUsername(String username) {
        return players.findByUsername(username)
                .map(Player::getId)
                .orElseThrow(() -> new NotFoundException("Player not found"));
    }

    @Transactional(readOnly = true)
    public ProgressView progressOf(UUID playerId) {
        return progress.findById(playerId)
                .map(row -> new ProgressView(row.getDuelsPlayed(), row.getDuelsWon(), row.getCurrencyBalance()))
                .orElseThrow(() -> new NotFoundException("Player not found"));
    }

    /** Called once per participant when a duel finishes. A draw counts as played for both and won by neither. */
    @Transactional
    public void recordDuelPlayed(UUID playerId, boolean won) {
        PlayerProgress row = progress.findById(playerId).orElseThrow(() -> new NotFoundException("Player not found"));
        row.setDuelsPlayed(row.getDuelsPlayed() + 1);
        if (won) {
            row.setDuelsWon(row.getDuelsWon() + 1);
        }
        row.setUpdatedAt(Instant.now());
    }

    /**
     * Deducts in-game currency. Runs in the caller's transaction so that a deduction and the entitlement it pays
     * for either both happen or neither does — a spend without a grant is the worst outcome available here.
     */
    @Transactional
    public void spendCurrency(UUID playerId, long amount) {
        if (amount < 0) {
            throw new BadRequestException("Amount must not be negative");
        }
        PlayerProgress row = progress.findById(playerId).orElseThrow(() -> new NotFoundException("Player not found"));
        if (row.getCurrencyBalance() < amount) {
            throw new BadRequestException("Insufficient balance");
        }
        row.setCurrencyBalance(row.getCurrencyBalance() - amount);
        row.setUpdatedAt(Instant.now());
    }

    @Transactional
    public void creditCurrency(UUID playerId, long amount) {
        PlayerProgress row = progress.findById(playerId).orElseThrow(() -> new NotFoundException("Player not found"));
        row.setCurrencyBalance(row.getCurrencyBalance() + amount);
        row.setUpdatedAt(Instant.now());
    }

    /**
     * A valid BCrypt hash of a value nobody knows, compared against when the username does not exist so that the
     * work done is the same either way.
     */
    private static final String DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
}
