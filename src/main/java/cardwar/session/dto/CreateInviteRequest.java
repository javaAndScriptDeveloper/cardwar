package cardwar.session.dto;

/** Optional body of an invite: the coins each player puts in. Absent means a friendly duel. */
public record CreateInviteRequest(Long stake) {

    public long stakeOrZero() {
        return stake == null ? 0 : stake;
    }
}
