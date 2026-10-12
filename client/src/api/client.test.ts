import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

function respond(status: number, body?: unknown, contentType = 'application/json') {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': contentType },
    });
}

describe('ApiClient', () => {
    it('sends the bearer token and JSON body, and parses the response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(respond(200, { duelId: 'd1', version: 3 }));
        const api = new ApiClient(fetchMock, () => 'tok-1');

        const view = await api.move('d1', { type: 'TAKE' });

        expect(view).toEqual({ duelId: 'd1', version: 3 });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/v1/duels/d1/moves');
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1');
        expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
        expect(init.body).toBe('{"type":"TAKE"}');
    });

    it('sends no Authorization header before sign-in', async () => {
        const fetchMock = vi.fn().mockResolvedValue(respond(200, { token: 't' }));
        const api = new ApiClient(fetchMock, () => undefined);

        await api.telegramSignIn('init-data');

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/v1/auth/telegram');
        expect(new Headers(init.headers).has('Authorization')).toBe(false);
        expect(init.body).toBe('{"initData":"init-data"}');
    });

    it('turns a problem detail into an ApiError carrying status and reason', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                respond(
                    400,
                    { status: 400, title: 'Illegal move', detail: 'Not your turn', reason: 'NOT_YOUR_TURN' },
                    'application/problem+json',
                ),
            );
        const api = new ApiClient(fetchMock, () => 't');

        const error = await api.move('d1', { type: 'END_ATTACK' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 400, reason: 'NOT_YOUR_TURN', detail: 'Not your turn' });
    });

    it('still produces an ApiError when the error body is not JSON', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
        const api = new ApiClient(fetchMock, () => 't');

        const error = await api.duel('d1').catch((e: unknown) => e);

        expect(error).toMatchObject({ status: 502, reason: undefined });
    });

    it('reports a network failure as status 0', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const api = new ApiClient(fetchMock, () => 't');

        await expect(api.activeDuels()).rejects.toMatchObject({ status: 0 });
    });

    it("reads the caller's pending invite, and none on 204", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(respond(200, { inviteId: 'i1', status: 'PENDING' }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const api = new ApiClient(fetchMock, () => 't');

        await expect(api.pendingInvite()).resolves.toMatchObject({ inviteId: 'i1' });
        await expect(api.pendingInvite()).resolves.toBeUndefined();
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/duels/invites/pending');
    });

    it('covers the endpoints the screens need', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(200, {})));
        const api = new ApiClient(fetchMock, () => 't');

        await api.passwordLogin('u', 'p');
        await api.register('u', 'p');
        await api.me();
        await api.activeDuels();
        await api.history();
        await api.createInvite();
        await api.inviteStatus('i1');
        await api.acceptInvite('i1');
        await api.duel('d1');

        const calls = fetchMock.mock.calls.map(
            ([url, init]) => `${(init as RequestInit).method ?? 'GET'} ${url}`,
        );
        expect(calls).toEqual([
            'POST /api/v1/auth/login',
            'POST /api/v1/auth/register',
            'GET /api/v1/me',
            'GET /api/v1/duels/active',
            'GET /api/v1/me/duels',
            'POST /api/v1/duels/invites',
            'GET /api/v1/duels/invites/i1',
            'POST /api/v1/duels/invites/i1/accept',
            'GET /api/v1/duels/d1',
        ]);
    });
});
