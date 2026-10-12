package cardwar.session.repository;

import cardwar.session.domain.DuelResult;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DuelResultRepository extends JpaRepository<DuelResult, UUID> {

    Optional<DuelResult> findByDuelId(UUID duelId);

    boolean existsByDuelId(UUID duelId);

    /** Both seats are indexed columns, so pass the same id twice rather than adding a third one to the row. */
    List<DuelResult> findByPlayerAOrPlayerBOrderByFinishedAtDesc(UUID playerA, UUID playerB, Pageable page);

    /** One row per opponent the player has finished a duel against: games, wins, losses, last time. */
    interface OpponentRecord {
        UUID getOpponent();

        long getPlayed();

        long getWon();

        long getLost();

        java.time.Instant getLastPlayedAt();
    }

    @org.springframework.data.jpa.repository.Query(
            value = "select case when player_a = :player then player_b else player_a end as opponent,"
                    + " count(*) as played,"
                    + " sum(case when winner_id = :player then 1 else 0 end) as won,"
                    + " sum(case when loser_id = :player then 1 else 0 end) as lost,"
                    + " max(finished_at) as lastPlayedAt"
                    + " from duel_result where player_a = :player or player_b = :player"
                    + " group by 1 order by max(finished_at) desc limit 50",
            nativeQuery = true)
    List<OpponentRecord> opponentsOf(@org.springframework.data.repository.query.Param("player") UUID player);

    @org.springframework.data.jpa.repository.Query(
            value = "select count(*) > 0 from duel_result where (player_a = :a and player_b = :b)"
                    + " or (player_a = :b and player_b = :a)",
            nativeQuery = true)
    boolean havePlayed(
            @org.springframework.data.repository.query.Param("a") UUID a,
            @org.springframework.data.repository.query.Param("b") UUID b);

    /** A player's wins and the stakes they took since a moment; players without a win in the window have no row. */
    interface WinTotals {
        UUID getPlayer();

        long getWins();

        long getCoinsWon();
    }

    @org.springframework.data.jpa.repository.Query(
            value = "select winner_id as player, count(*) as wins, coalesce(sum(stake), 0) as coinsWon"
                    + " from duel_result where winner_id in (:players) and finished_at >= :since"
                    + " group by winner_id",
            nativeQuery = true)
    List<WinTotals> winsSince(
            @org.springframework.data.repository.query.Param("players") Collection<UUID> players,
            @org.springframework.data.repository.query.Param("since") Instant since);
}
