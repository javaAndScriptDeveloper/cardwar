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
    /** Engine end reason; 'FORFEIT' when a player missed three moves. */
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
    /** ISO instant the player to move must act by; absent when finished (and from servers without the clock). */
    deadline?: string;
    /** Player id whose clock runs. */
    toMove?: string;
    /** Missed moves so far; the third forfeits the duel. */
    strikes?: { you: number; opponent: number };
    /** The opponent's card back and avatar frame; absent from servers without the shop. */
    opponentCosmetics?: CosmeticsView;
}

export type MatchStatus = 'WAITING' | 'MATCHED' | 'EXPIRED';

/** The caller's quick-match queue entry. `duelId` is set once MATCHED. */
export interface MatchView {
    status: MatchStatus;
    stake: number;
    since: string;
    duelId?: string;
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
    | 'STARS_TOPUP'
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

/**
 * One SSE event body. Engine events only nudge a re-fetch, so their other fields are ignored; an `EMOTE` is not
 * part of the duel state and is shown from the event itself: `player` threw `emote` (a content ref).
 */
export interface DuelEvent {
    type: string;
    duelId: string;
    player?: string;
    emote?: string;
}

export type ItemType = 'DECK' | 'CARD_BACK' | 'TABLE' | 'FRAME' | 'EMOTE';

/** One cosmetic: `contentRef` names the pack or built-in style it shows; the price is in coins. */
export interface ShopItemView {
    code: string;
    type: ItemType;
    contentRef: string;
    name: string;
    price: number;
    owned: boolean;
    equipped: boolean;
}

/** Coins sold for Telegram Stars. */
export interface CoinPackView {
    id: string;
    coins: number;
    stars: number;
}

export interface ShopView {
    items: ShopItemView[];
    coinPacks: CoinPackView[];
}

/** What a player has equipped, as content refs; `emotes` are all the emotes they own. */
export interface LoadoutView {
    deck: string;
    cardBack: string;
    table: string;
    frame?: string;
    emotes: string[];
}

export interface InvoiceView {
    invoiceLink: string;
}

/** The part of the opponent's loadout visible at the table. */
export interface CosmeticsView {
    cardBack: string;
    frame?: string;
}
