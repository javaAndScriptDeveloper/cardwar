// Wire types mirroring the backend records (cardwar.session.dto, cardwar.account.dto). Field names are the JSON
// names; optional fields are the ones the backend omits when null (@JsonInclude NON_NULL).
import type { Card, Suit } from '../game/cards';

export type DuelPhase = 'ATTACK' | 'DEFEND' | 'FINISHED';

export interface TablePairView {
    attack: Card;
    defence?: Card;
}

export interface OutcomeView {
    winner?: string;
    loser?: string;
    draw: boolean;
    reason: string;
}

export interface DuelView {
    duelId: string;
    you: string;
    opponent: string;
    hand: Card[];
    opponentHandCount: number;
    talonCount: number;
    trumpCard: Card;
    trumpSuit: Suit;
    table: TablePairView[];
    discardCount: number;
    attacker: string;
    phase: DuelPhase;
    outcome?: OutcomeView;
    version: number;
    /** Coins each player put in; 0 is a friendly duel. The pot is twice this. */
    stake: number;
}

export interface AuthResponse {
    playerId: string;
    username: string;
    token: string;
    expiresAt: string;
}

export type InviteStatus = 'PENDING' | 'ACCEPTED';

export interface InviteView {
    inviteId: string;
    status: InviteStatus;
    duelId?: string;
    expiresAt: string;
    stake: number;
}

export interface DuelSummary {
    duelId: string;
    opponentId: string;
    opponentUsername: string;
    attacker: string;
    phase: DuelPhase;
    version: number;
    stake: number;
}

export type DuelResult = 'WON' | 'LOST' | 'DRAW';

export interface DuelHistoryEntry {
    duelId: string;
    opponentId: string;
    opponentUsername: string;
    result: DuelResult;
    endReason: string;
    startedAt: string;
    finishedAt: string;
    moveCount: number;
    stake: number;
    /** Signed net coins for the caller: +stake on a win, -stake on a loss, 0 on a draw or a friendly duel. */
    coinDelta: number;
}

export interface DailyBonusView {
    available: boolean;
    amount: number;
    streakDay: number;
    /** ISO instant of the next Kyiv midnight when the bonus is not available. */
    nextAt: string;
}

export interface WalletView {
    balance: number;
    dailyBonus: DailyBonusView;
}

export type CoinKind =
    | 'STARTER'
    | 'DAILY_BONUS'
    | 'STAKE_ESCROW'
    | 'STAKE_PAYOUT'
    | 'STAKE_REFUND'
    | 'PURCHASE'
    | 'LEGACY'
    | 'ADJUSTMENT';

export interface CoinTransactionView {
    /** Signed: credits positive, debits negative. */
    amount: number;
    kind: CoinKind;
    createdAt: string;
}

export interface PlayerSummary {
    id: string;
    username: string;
    displayName: string;
}

export interface MeView {
    player: PlayerSummary;
}

export type MoveRequest =
    | { type: 'ATTACK'; card: Card }
    | { type: 'DEFEND'; attackCard: Card; card: Card }
    | { type: 'TAKE' }
    | { type: 'END_ATTACK' };

/** RFC 9457 problem detail; `reason` is the engine's code for an illegal move (NOT_YOUR_TURN, CANNOT_BEAT, ...). */
export interface ProblemDetail {
    type?: string;
    title?: string;
    status: number;
    detail?: string;
    reason?: string;
    errors?: Record<string, string>;
}

/** One SSE event body. Only `type` and `duelId` matter to the client: every event just triggers a re-fetch. */
export interface DuelEvent {
    type: string;
    duelId: string;
}
