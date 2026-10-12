package cardwar.wallet.service;

import cardwar.exception.BadRequestException;
import cardwar.exception.ConflictException;
import cardwar.exception.NotFoundException;
import cardwar.wallet.domain.DailyMission;
import cardwar.wallet.dto.CoinKind;
import cardwar.wallet.dto.MissionCode;
import cardwar.wallet.dto.MissionView;
import cardwar.wallet.dto.WalletView;
import cardwar.wallet.repository.DailyMissionRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Daily missions: progress is recorded when a duel completes (in that transaction, so a repeated completion cannot
 * step a mission twice), and the reward is one ledger credit per player, day and mission. Like the daily bonus, the
 * day is the Kyiv calendar day; the clock-free {@code ...On(day)} methods are the testable core.
 */
@Slf4j
@Service
public class MissionService {

    public static final String MISSION_INCOMPLETE = "MISSION_INCOMPLETE";
    public static final String ALREADY_CLAIMED = "ALREADY_CLAIMED";

    private final DailyMissionRepository missions;
    private final WalletService wallets;
    private final DailyBonusService bonuses;
    private final Clock clock;

    public MissionService(
            DailyMissionRepository missions, WalletService wallets, DailyBonusService bonuses, Clock clock) {
        this.missions = missions;
        this.wallets = wallets;
        this.bonuses = bonuses;
        this.clock = clock;
    }

    /** Called once per participant when a duel completes, in the completion's transaction. */
    @Transactional
    public void record(UUID playerId, boolean won, long stake) {
        recordOn(playerId, today(), won, stake);
    }

    @Transactional
    public void recordOn(UUID playerId, LocalDate day, boolean won, long stake) {
        for (MissionCode code : MissionCode.values()) {
            if (!code.counts(won, stake)) {
                continue;
            }
            DailyMission row = missions.findById(new DailyMission.Key(playerId, day, code.name()))
                    .orElseGet(() -> new DailyMission(playerId, day, code.name()));
            row.advance(code.target());
            missions.save(row);
        }
    }

    @Transactional(readOnly = true)
    public java.util.List<MissionView> missionsOf(UUID playerId) {
        return missionsOn(playerId, today());
    }

    @Transactional(readOnly = true)
    public java.util.List<MissionView> missionsOn(UUID playerId, LocalDate day) {
        Map<String, DailyMission> rows = missions.findByPlayerIdAndDay(playerId, day).stream()
                .collect(Collectors.toMap(DailyMission::getCode, Function.identity()));
        return Arrays.stream(MissionCode.values())
                .map(code -> viewOf(code, rows.get(code.name())))
                .toList();
    }

    /** Pays a completed mission; 400 {@value #MISSION_INCOMPLETE}, 409 {@value #ALREADY_CLAIMED}, 404 unknown code. */
    @Transactional
    public WalletView claim(UUID playerId, String code) {
        claimOn(playerId, today(), code);
        return bonuses.view(playerId);
    }

    @Transactional
    public MissionView claimOn(UUID playerId, LocalDate day, String codeName) {
        MissionCode code = Arrays.stream(MissionCode.values())
                .filter(candidate -> candidate.name().equals(codeName))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("No such mission"));
        DailyMission row = missions.findById(new DailyMission.Key(playerId, day, code.name()))
                .orElseThrow(() -> new BadRequestException("This mission is not complete yet", MISSION_INCOMPLETE));
        if (row.getProgress() < code.target()) {
            throw new BadRequestException("This mission is not complete yet", MISSION_INCOMPLETE);
        }
        if (row.isClaimed()) {
            throw new ConflictException("This mission's reward has already been claimed", ALREADY_CLAIMED);
        }
        row.claim(clock.instant());
        // The ledger key is the last word: two claims racing past the check above pay once, and the loser is told.
        boolean paid = wallets.credit(playerId, code.reward(), CoinKind.MISSION_REWARD, "mission:" + day + ":" + code);
        if (!paid) {
            throw new ConflictException("This mission's reward has already been claimed", ALREADY_CLAIMED);
        }
        log.info("Player {} claimed mission {} for {}", playerId, code, day);
        return viewOf(code, row);
    }

    private static MissionView viewOf(MissionCode code, DailyMission row) {
        return new MissionView(
                code.name(),
                code.target(),
                row == null ? 0 : row.getProgress(),
                code.reward(),
                row != null && row.isClaimed());
    }

    private LocalDate today() {
        return DailyBonusService.kyivDate(clock.instant());
    }
}
