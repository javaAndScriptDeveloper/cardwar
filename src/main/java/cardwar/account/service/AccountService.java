package cardwar.account.service;

import cardwar.account.domain.Player;
import cardwar.account.domain.PlayerProgress;
import cardwar.account.dto.DuelOutcomeKind;
import cardwar.account.dto.PlayerSummary;
import cardwar.account.dto.ProgressView;
import cardwar.account.dto.Rank;
import cardwar.account.repository.PlayerProgressRepository;
import cardwar.account.repository.PlayerRepository;
import cardwar.exception.ConflictException;
import cardwar.exception.NotFoundException;
import cardwar.metrics.GameMetrics;
import cardwar.metrics.GameMetrics.SignIn;
import cardwar.security.PlayerIdentity;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.service.WalletService;
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

    private final GameMetrics metrics;
    private final WalletService wallets;

    public AccountService(
            PlayerRepository players,
            PlayerProgressRepository progress,
            PasswordEncoder passwordEncoder,
            GameMetrics metrics,
            WalletService wallets) {
        this.players = players;
        this.progress = progress;
        this.passwordEncoder = passwordEncoder;
        this.metrics = metrics;
        this.wallets = wallets;
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
        wallets.open(player.getId());
        log.info("Registered player {}", player.getId());
        metrics.signIn(SignIn.REGISTER);
        return new PlayerIdentity(player.getId(), player.getUsername());
    }

    /**
     * Finds or creates the account for a Telegram user whose identity the caller has already verified. Idempotent:
     * a returning user gets the same account. The display name, {@code @handle} and photo are copied on every
     * sign-in because people change them in Telegram; the internal {@code username} never changes, since invites
     * and older clients refer to it.
     *
     * <p>Two first sign-ins for the same Telegram user racing each other meet at the unique constraint; the loser
     * gets a 409 and its client simply signs in again, which then finds the account.
     */
    @Transactional
    public PlayerIdentity registerTelegram(long telegramUserId, String displayName, String handle, String photoUrl) {
        Optional<Player> existing = players.findByTelegramUserId(telegramUserId);
        if (existing.isPresent()) {
            Player player = existing.get();
            player.setDisplayName(displayNameOr(displayName, player.getUsername()));
            player.setTelegramHandle(handle);
            player.setPhotoUrl(photoUrl);
            return identityOf(player);
        }
        String username = telegramUsername(telegramUserId);
        var now = Instant.now();
        var player =
                Player.telegram(UUID.randomUUID(), username, telegramUserId, displayNameOr(displayName, username), now);
        player.setTelegramHandle(handle);
        player.setPhotoUrl(photoUrl);
        try {
            players.saveAndFlush(player);
        } catch (DataIntegrityViolationException raced) {
            throw new ConflictException("This Telegram account is being signed in already; try again");
        }
        progress.save(new PlayerProgress(player.getId(), now));
        wallets.open(player.getId());
        log.info("Registered Telegram player {}", player.getId());
        return identityOf(player);
    }

    /**
     * {@code tg_<id>} reads well and is unique among Telegram accounts. A password account may have registered that
     * exact name first, since nothing reserves the prefix, so a short random suffix settles the collision.
     */
    private String telegramUsername(long telegramUserId) {
        String base = "tg_" + telegramUserId;
        if (!players.existsByUsername(base)) {
            return base;
        }
        return base + "_" + UUID.randomUUID().toString().substring(0, 4);
    }

    private static String displayNameOr(String displayName, String fallback) {
        if (displayName == null || displayName.isBlank()) {
            return fallback;
        }
        String trimmed = displayName.strip();
        return trimmed.length() > MAX_DISPLAY_NAME ? trimmed.substring(0, MAX_DISPLAY_NAME) : trimmed;
    }

    private static PlayerIdentity identityOf(Player player) {
        return new PlayerIdentity(player.getId(), player.getUsername());
    }

    /**
     * Verifies credentials without revealing which half was wrong. The hash comparison runs even for an unknown
     * username so that response timing does not become a username oracle.
     */
    @Transactional(readOnly = true)
    public Optional<PlayerIdentity> authenticate(String username, String rawPassword) {
        Optional<Player> found = players.findByUsername(username);
        // A Telegram-only account has no hash; it is compared like an unknown username so both fail identically.
        String hash = found.map(Player::getPasswordHash).orElse(null);
        boolean matches = passwordEncoder.matches(rawPassword, hash == null ? DUMMY_HASH : hash);
        if (hash == null || !matches) {
            log.debug("Failed authentication attempt");
            return Optional.empty();
        }
        metrics.signIn(SignIn.PASSWORD);
        return found.map(player -> new PlayerIdentity(player.getId(), player.getUsername()));
    }

    /** The Telegram user id behind a Telegram account, which is also its private chat id with the bot. */
    @Transactional(readOnly = true)
    public java.util.Optional<Long> telegramUserIdOf(UUID playerId) {
        return players.findById(playerId).map(Player::getTelegramUserId);
    }

    @Transactional(readOnly = true)
    public PlayerSummary summary(UUID playerId) {
        return players.findById(playerId)
                .map(player -> new PlayerSummary(
                        player.getId(),
                        player.getUsername(),
                        player.getDisplayName(),
                        player.getTelegramHandle(),
                        player.getPhotoUrl()))
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
        return viewOf(requireProgress(playerId));
    }

    /** The longest run of consecutive wins ever; 0 for an unknown player, since nothing is gated on absence. */
    @Transactional(readOnly = true)
    public int bestWinStreakOf(UUID playerId) {
        return progress.findById(playerId).map(PlayerProgress::getBestWinStreak).orElse(0);
    }

    /**
     * Called once per participant when a duel finishes, inside the completion's transaction, so a completion that
     * runs twice (the sweep and the last move) cannot count twice. A win extends the streak, a loss ends it, a draw
     * leaves it alone; XP is 30 for a win (40 when coins were at stake), 10 for a loss, 15 for a draw.
     */
    @Transactional
    public ProgressView recordDuelPlayed(UUID playerId, DuelOutcomeKind kind, boolean staked) {
        PlayerProgress row = requireProgress(playerId);
        row.setDuelsPlayed(row.getDuelsPlayed() + 1);
        switch (kind) {
            case WIN -> {
                row.setDuelsWon(row.getDuelsWon() + 1);
                row.setWinStreak(row.getWinStreak() + 1);
                row.setBestWinStreak(Math.max(row.getBestWinStreak(), row.getWinStreak()));
                row.setXp(row.getXp() + XP_WIN + (staked ? XP_STAKED_WIN_EXTRA : 0));
            }
            case LOSS -> {
                row.setWinStreak(0);
                row.setXp(row.getXp() + XP_LOSS);
            }
            case DRAW -> row.setXp(row.getXp() + XP_DRAW);
        }
        row.setUpdatedAt(Instant.now());
        return viewOf(row);
    }

    private PlayerProgress requireProgress(UUID playerId) {
        return progress.findById(playerId).orElseThrow(() -> new NotFoundException("Player not found"));
    }

    private ProgressView viewOf(PlayerProgress row) {
        Rank rank = Rank.of(row.getXp());
        return new ProgressView(
                row.getDuelsPlayed(),
                row.getDuelsWon(),
                wallets.balance(row.getPlayerId()),
                row.getWinStreak(),
                row.getBestWinStreak(),
                row.getXp(),
                rank,
                rank.nextXp(),
                ProgressView.bonusPercentFor(row.getWinStreak()));
    }

    /**
     * Deducts in-game currency for an unlock. Runs in the caller's transaction so that a deduction and the
     * entitlement it pays for either both happen or neither does. The coins live in the wallet's ledger.
     */
    @Transactional
    public void spendCurrency(UUID playerId, long amount) {
        wallets.debit(playerId, amount, CoinKind.PURCHASE, "purchase:" + UUID.randomUUID());
    }

    /** A manual credit (support, tests); every call is its own ledger row. */
    @Transactional
    public void creditCurrency(UUID playerId, long amount) {
        wallets.credit(playerId, amount, CoinKind.ADJUSTMENT, "adjustment:" + UUID.randomUUID());
    }

    /**
     * A valid BCrypt hash of a value nobody knows, compared against when the username does not exist so that the
     * work done is the same either way.
     */
    /** Mirrors the {@code display_name} column width. */
    private static final int MAX_DISPLAY_NAME = 64;

    static final int XP_WIN = 30;
    static final int XP_STAKED_WIN_EXTRA = 10;
    static final int XP_LOSS = 10;
    static final int XP_DRAW = 15;

    private static final String DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
}
