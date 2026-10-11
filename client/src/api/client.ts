import type {
    AuthResponse,
    DuelHistoryEntry,
    DuelSummary,
    DuelView,
    InviteView,
    MeView,
    MoveRequest,
    ProblemDetail,
} from './types';

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

    createInvite(): Promise<InviteView> {
        return this.request('POST', '/duels/invites');
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

    private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
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
        if (!response.ok) {
            throw new ApiError(response.status, await problemOf(response));
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
