import type {
    AuthResponse,
    CoinTransactionView,
    DuelHistoryEntry,
    DuelSummary,
    DuelView,
    InviteView,
    MatchView,
    MeView,
    MoveRequest,
    ProblemDetail,
    WalletView,
} from './types';
import { serverOffset } from '../state/clock';

export const API_BASE = '/api/v1';

/** Any non-2xx answer, or no answer at all (status 0). `reason` is set for illegal moves. */
export class ApiError extends Error {
    readonly status: number;
    readonly reason: string | undefined;
    readonly detail: string | undefined;

    constructor(status: number, problem?: Partial<ProblemDetail>) {
        super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
        this.name = 'ApiError';
        this.status = status;
        this.reason = problem?.reason;
        this.detail = problem?.detail;
    }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Typed calls to /api/v1. The token is read through a getter on every request so the client never holds a stale
 * one, and lives only in memory (see src/auth).
 */
export class ApiClient {
    private readonly fetchImpl: FetchLike;
    private readonly token: () => string | undefined;
    private offsetMs = 0;

    constructor(fetchImpl: FetchLike, token: () => string | undefined) {
        this.fetchImpl = fetchImpl;
        this.token = token;
    }

    passwordLogin(username: string, password: string): Promise<AuthResponse> {
        return this.request('POST', '/auth/login', { username, password });
    }

    register(username: string, password: string): Promise<AuthResponse> {
        return this.request('POST', '/auth/register', { username, password });
    }

    telegramSignIn(initData: string): Promise<AuthResponse> {
        return this.request('POST', '/auth/telegram', { initData });
    }

    me(): Promise<MeView> {
        return this.request('GET', '/me');
    }

    activeDuels(): Promise<DuelSummary[]> {
        return this.request('GET', '/duels/active');
    }

    history(): Promise<DuelHistoryEntry[]> {
        return this.request('GET', '/me/duels');
    }

    /** Without a stake the body is empty, which the server reads as a friendly duel. */
    createInvite(stake?: number): Promise<InviteView> {
        return this.request('POST', '/duels/invites', stake === undefined ? undefined : { stake });
    }

    wallet(): Promise<WalletView> {
        return this.request('GET', '/wallet');
    }

    /** 409 with reason BONUS_ALREADY_CLAIMED when today's bonus is already taken (another tap or device). */
    claimDailyBonus(): Promise<WalletView> {
        return this.request('POST', '/wallet/daily-bonus');
    }

    /** Newest first, at most 50. */
    transactions(): Promise<CoinTransactionView[]> {
        return this.request('GET', '/wallet/transactions');
    }

    /** Joins the queue at a stake table; the answer may already be MATCHED when someone was waiting there. */
    enterMatchmaking(stake: number): Promise<MatchView> {
        return this.request('POST', '/matchmaking', { stake });
    }

    /** The caller's queue entry; the server answers 204 (undefined here) when the caller is not queued. */
    matchmakingStatus(): Promise<MatchView | undefined> {
        return this.request('GET', '/matchmaking');
    }

    leaveMatchmaking(): Promise<void> {
        return this.request('DELETE', '/matchmaking');
    }

    /** Last measured server-minus-device clock difference in ms (see src/state/clock). */
    serverOffsetMs(): number {
        return this.offsetMs;
    }

    /** The caller's invite nobody has accepted yet; the server answers 204 when there is none. */
    pendingInvite(): Promise<InviteView | undefined> {
        return this.request('GET', '/duels/invites/pending');
    }

    inviteStatus(inviteId: string): Promise<InviteView> {
        return this.request('GET', `/duels/invites/${encodeURIComponent(inviteId)}`);
    }

    acceptInvite(inviteId: string): Promise<DuelView> {
        return this.request('POST', `/duels/invites/${encodeURIComponent(inviteId)}/accept`);
    }

    duel(duelId: string): Promise<DuelView> {
        return this.request('GET', `/duels/${encodeURIComponent(duelId)}`);
    }

    move(duelId: string, move: MoveRequest): Promise<DuelView> {
        return this.request('POST', `/duels/${encodeURIComponent(duelId)}/moves`, move);
    }

    /** Headers for a raw request (the event stream), so it authenticates exactly like everything else. */
    authHeaders(): Headers {
        const headers = new Headers();
        const token = this.token();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        return headers;
    }

    /**
     * The `Date` header has whole seconds, so a difference under one second cannot be told from a synced clock
     * and is taken as zero rather than as a bias of up to a second.
     */
    private measureClock(response: Response): void {
        const date = response.headers.get('Date');
        const serverMs = date ? Date.parse(date) : NaN;
        if (Number.isNaN(serverMs)) {
            return;
        }
        const offset = serverMs - Date.now();
        this.offsetMs = Math.abs(offset) < 1000 ? 0 : offset;
        serverOffset.value = this.offsetMs;
    }

    private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
        const headers = this.authHeaders();
        headers.set('Accept', 'application/json');
        const init: RequestInit = { method, headers };
        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
            init.body = JSON.stringify(body);
        }
        let response: Response;
        try {
            response = await this.fetchImpl(`${API_BASE}${path}`, init);
        } catch {
            throw new ApiError(0, { detail: 'Network unavailable' });
        }
        this.measureClock(response);
        if (!response.ok) {
            throw new ApiError(response.status, await problemOf(response));
        }
        if (response.status === 204) {
            return undefined as T;
        }
        return (await response.json()) as T;
    }
}

async function problemOf(response: Response): Promise<Partial<ProblemDetail> | undefined> {
    try {
        return (await response.json()) as Partial<ProblemDetail>;
    } catch {
        return undefined;
    }
}
