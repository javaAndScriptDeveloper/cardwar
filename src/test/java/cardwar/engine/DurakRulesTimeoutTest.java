package cardwar.engine;

import static cardwar.engine.Duels.ALICE;
import static cardwar.engine.Duels.BOB;
import static cardwar.engine.Duels.card;
import static cardwar.engine.Duels.duel;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Whose clock runs, and what the server plays for a player whose clock ran out. Alice attacks; trumps are hearts. */
class DurakRulesTimeoutTest {

    @Test
    void theAttackerIsToMoveOnAnEmptyTableAndAttacksWithTheLowestNonTrump() {
        DuelState state = duel().trump(Suit.HEARTS)
                .handA(card(Rank.SIX, Suit.HEARTS), card(Rank.NINE, Suit.CLUBS), card(Rank.SEVEN, Suit.SPADES))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .build();

        assertThat(DurakRules.toMove(state)).isEqualTo(ALICE);
        assertThat(DurakRules.timeoutCommand(state)).isEqualTo(new GameCommand.Attack(card(Rank.SEVEN, Suit.SPADES)));
    }

    @Test
    void anAttackerHoldingOnlyTrumpsLeadsTheLowestTrump() {
        DuelState state = duel().trump(Suit.HEARTS)
                .handA(card(Rank.KING, Suit.HEARTS), card(Rank.EIGHT, Suit.HEARTS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .build();

        assertThat(DurakRules.timeoutCommand(state)).isEqualTo(new GameCommand.Attack(card(Rank.EIGHT, Suit.HEARTS)));
    }

    @Test
    void theDefenderFacingAnOpenAttackIsToMoveAndTakes() {
        DuelState state = duel().trump(Suit.HEARTS)
                .handA(card(Rank.NINE, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(new TablePair(card(Rank.SIX, Suit.SPADES), null))
                .build();

        assertThat(DurakRules.toMove(state)).isEqualTo(BOB);
        assertThat(DurakRules.timeoutCommand(state)).isEqualTo(new GameCommand.TakeCards());
    }

    @Test
    void theAttackerWithEverythingBeatenIsToMoveAndEndsTheAttack() {
        DuelState state = duel().trump(Suit.HEARTS)
                .handA(card(Rank.NINE, Suit.CLUBS))
                .handB(card(Rank.ACE, Suit.CLUBS))
                .table(new TablePair(card(Rank.SIX, Suit.SPADES), card(Rank.TEN, Suit.SPADES)))
                .build();

        assertThat(DurakRules.toMove(state)).isEqualTo(ALICE);
        assertThat(DurakRules.timeoutCommand(state)).isEqualTo(new GameCommand.EndAttack());
    }
}
