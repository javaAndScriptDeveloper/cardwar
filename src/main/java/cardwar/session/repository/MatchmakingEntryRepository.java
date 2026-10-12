package cardwar.session.repository;

import cardwar.session.domain.MatchmakingEntry;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MatchmakingEntryRepository extends JpaRepository<MatchmakingEntry, UUID> {

    /** Serialises entries at one stake table for the rest of the transaction; released on commit or rollback. */
    @Query(value = "select cast(pg_advisory_xact_lock(:table) as text)", nativeQuery = true)
    String lockTable(@Param("table") long table);

    /** The longest-waiting other player at this table whose entry is still fresh. */
    @Query(
            value = "select * from matchmaking_entry where stake = :stake and player_id <> :player"
                    + " and matched_duel_id is null and created_at > :freshAfter order by created_at limit 1",
            nativeQuery = true)
    Optional<MatchmakingEntry> oldestWaiting(
            @Param("stake") long stake, @Param("player") UUID player, @Param("freshAfter") Instant freshAfter);
}
