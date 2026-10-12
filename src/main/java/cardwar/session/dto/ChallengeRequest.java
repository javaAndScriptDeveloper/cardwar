package cardwar.session.dto;

/** Body of a challenge: the stake each player puts in; absent means friendly. */
public record ChallengeRequest(Long stake) {

    public long stakeOrZero() {
        return stake == null ? 0 : stake;
    }
}
