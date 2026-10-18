import { act, renderHook, waitFor } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { navigate, parseRoute, routeHash, useRoute } from './index';

describe('parseRoute', () => {
    it.each([
        ['', { name: 'lobby' }],
        ['#/', { name: 'lobby' }],
        ['#/friends', { name: 'friends' }],
        ['#/settings', { name: 'settings' }],
        ['#/cards', { name: 'cards' }],
        ['#/duel/abc-1', { name: 'duel', duelId: 'abc-1' }],
        ['#/duel', { name: 'lobby' }],
        ['#/garbage/x', { name: 'lobby' }],
    ])('%s', (hash, route) => {
        expect(parseRoute(hash)).toEqual(route);
    });

    it('round-trips every route', () => {
        for (const route of [
            { name: 'lobby' as const },
            { name: 'shop' as const },
            { name: 'settings' as const },
            { name: 'cards' as const },
            { name: 'duel' as const, duelId: 'd/1' },
        ]) {
            expect(parseRoute(routeHash(route))).toEqual(route);
        }
    });
});

describe('useRoute', () => {
    beforeEach(() => {
        window.location.hash = '';
    });

    it('follows navigate()', async () => {
        const { result } = renderHook(() => useRoute());
        expect(result.current).toEqual({ name: 'lobby' });
        // jsdom delivers hashchange asynchronously, as browsers do.
        await act(() => navigate({ name: 'shop' }));
        await waitFor(() => expect(result.current).toEqual({ name: 'shop' }));
    });
});
