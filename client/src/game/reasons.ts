/** One sentence per engine IllegalMoveReason (cardwar.engine.IllegalMoveReason), for the rejection toast. */
const MESSAGES: Record<string, string> = {
    NOT_A_PARTICIPANT: 'You are not playing in this duel.',
    DUEL_FINISHED: 'The duel is already over.',
    NOT_YOUR_TURN: 'Not your turn.',
    CARD_NOT_IN_HAND: 'That card is not in your hand any more.',
    TABLE_EMPTY: 'There is nothing on the table to end.',
    ATTACK_LIMIT_REACHED: 'A round holds at most six attacks.',
    DEFENDER_HAND_TOO_SMALL: 'Your opponent has no card left to answer another attack.',
    RANK_NOT_ON_TABLE: 'You can only throw in a rank that is already on the table.',
    TARGET_NOT_ON_TABLE: 'That card is not on the table.',
    TARGET_ALREADY_DEFENDED: 'That card has already been beaten.',
    CANNOT_BEAT: 'That card does not beat it.',
    UNDEFENDED_CARDS_REMAIN: 'Wait until every card on the table is beaten.',
    NOTHING_TO_TAKE: 'There is nothing to take.',
};

export function reasonMessage(reason: string | undefined): string | undefined {
    return reason === undefined ? undefined : MESSAGES[reason];
}
