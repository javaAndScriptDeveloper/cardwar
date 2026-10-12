import { describe, expect, it, vi } from 'vitest';
import { serverOffset } from '../state/clock';
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

    it('reaches the wallet endpoints', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(200, {})));
        const api = new ApiClient(fetchMock, () => 't');

        await api.wallet();
        await api.claimDailyBonus();
        await api.transactions();

        const calls = fetchMock.mock.calls.map(
            ([url, init]) => `${(init as RequestInit).method ?? 'GET'} ${url}`,
        );
        expect(calls).toEqual([
            'GET /api/v1/wallet',
            'POST /api/v1/wallet/daily-bonus',
            'GET /api/v1/wallet/transactions',
        ]);
    });

    it('reaches the shop, loadout, Stars and emote endpoints', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(200, {})));
        const api = new ApiClient(fetchMock, () => 't');

        await api.shop();
        await api.buyItem('back-trident');
        await api.equipItem('back-trident');
        await api.loadout();
        await api.starsInvoice('coins-1000');
        await api.emote('d1', 'emote-like');

        const calls = fetchMock.mock.calls.map(
            ([url, init]) => `${(init as RequestInit).method ?? 'GET'} ${url}`,
        );
        expect(calls).toEqual([
            'GET /api/v1/shop',
            'POST /api/v1/shop/items/back-trident/buy',
            'POST /api/v1/shop/items/back-trident/equip',
            'GET /api/v1/me/loadout',
            'POST /api/v1/shop/stars/invoice',
            'POST /api/v1/duels/d1/emotes',
        ]);
        const bodies = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body);
        expect(bodies[4]).toBe('{"packId":"coins-1000"}');
        expect(bodies[5]).toBe('{"code":"emote-like"}');
    });

    it('reaches the friends and challenge endpoints', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(() => Promise.resolve(respond(200, [])))
            .mockResolvedValueOnce(respond(200, []))
            .mockResolvedValueOnce(respond(200, { inviteId: 'i1', invitee: 'p2' }))
            .mockResolvedValueOnce(respond(200, []))
            .mockResolvedValueOnce(respond(200, []))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const api = new ApiClient(fetchMock, () => 't');

        await api.friends();
        await expect(api.challenge('p2', 100)).resolves.toMatchObject({ invitee: 'p2' });
        await api.challenges();
        await api.outgoingChallenges();
        await expect(api.declineInvite('i9')).resolves.toBeUndefined();

        const calls = fetchMock.mock.calls.map(
            ([url, init]) => `${(init as RequestInit).method ?? 'GET'} ${url}`,
        );
        expect(calls).toEqual([
            'GET /api/v1/friends',
            'POST /api/v1/friends/p2/challenge',
            'GET /api/v1/challenges',
            'GET /api/v1/challenges/outgoing',
            'POST /api/v1/duels/invites/i9/decline',
        ]);
        expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe('{"stake":100}');
    });

    it('sends the stake when creating an invite with one, and no body without', async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond(200, {})));
        const api = new ApiClient(fetchMock, () => 't');

        await api.createInvite(500);
        await api.createInvite(0);
        await api.createInvite();

        const bodies = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body);
        expect(bodies).toEqual(['{"stake":500}', '{"stake":0}', undefined]);
    });

    it('reaches the matchmaking endpoints, reading no queue entry on 204', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(respond(200, { status: 'WAITING', stake: 100, since: 'x' }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const api = new ApiClient(fetchMock, () => 't');

        await expect(api.enterMatchmaking(100)).resolves.toMatchObject({ status: 'WAITING', stake: 100 });
        await expect(api.matchmakingStatus()).resolves.toBeUndefined();
        await expect(api.leaveMatchmaking()).resolves.toBeUndefined();

        const calls = fetchMock.mock.calls.map(
            ([url, init]) => `${(init as RequestInit).method ?? 'GET'} ${url}`,
        );
        expect(calls).toEqual([
            'POST /api/v1/matchmaking',
            'GET /api/v1/matchmaking',
            'DELETE /api/v1/matchmaking',
        ]);
        expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBe('{"stake":100}');
    });

    it('measures the server clock offset from the Date header', async () => {
        const ahead = new Date(Date.now() + 60_000).toUTCString();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response('{}', {
                    status: 200,
                    headers: { Date: ahead, 'Content-Type': 'application/json' },
                }),
            )
            .mockResolvedValueOnce(respond(200, {}));
        const api = new ApiClient(fetchMock, () => 't');
        expect(api.serverOffsetMs()).toBe(0);

        await api.me();
        expect(api.serverOffsetMs()).toBeGreaterThan(58_000);
        expect(api.serverOffsetMs()).toBeLessThan(61_000);
        expect(serverOffset.value).toBe(api.serverOffsetMs());

        // A response without the header keeps the last measurement.
        await api.me();
        expect(api.serverOffsetMs()).toBeGreaterThan(58_000);
    });

    it('treats a sub-second difference as a synced clock (the header has whole seconds)', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                new Response('{}', { status: 200, headers: { Date: new Date().toUTCString() } }),
            );
        const api = new ApiClient(fetchMock, () => 't');

        await api.me();

        expect(api.serverOffsetMs()).toBe(0);
    });

    it('records the offset from error responses too', async () => {
        const behind = new Date(Date.now() - 30_000).toUTCString();
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response(null, { status: 503, headers: { Date: behind } }));
        const api = new ApiClient(fetchMock, () => 't');

        await api.me().catch(() => undefined);

        expect(api.serverOffsetMs()).toBeLessThan(-29_000);
    });
});
