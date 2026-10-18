import { useEffect, useState } from 'preact/hooks';

export type Route =
    | { name: 'lobby' }
    | { name: 'friends' }
    | { name: 'shop' }
    | { name: 'profile' }
    | { name: 'settings' }
    | { name: 'cards' }
    | { name: 'duel'; duelId: string };

/** The screens the bottom navigation switches between. */
export const TOP_LEVEL: ReadonlySet<Route['name']> = new Set(['lobby', 'friends', 'shop', 'profile']);

/**
 * Hash routes, so nginx's SPA fallback and Telegram's one-URL Mini App stay untouched. Unknown hashes land on the
 * lobby: a stale deep link must never show a blank screen.
 */
export function parseRoute(hash: string): Route {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    switch (parts[0]) {
        case undefined:
            return { name: 'lobby' };
        case 'friends':
        case 'shop':
        case 'profile':
        case 'settings':
        case 'cards':
            return { name: parts[0] };
        case 'duel':
            return parts[1] ? { name: 'duel', duelId: decodeURIComponent(parts[1]) } : { name: 'lobby' };
        default:
            return { name: 'lobby' };
    }
}

export function routeHash(route: Route): string {
    switch (route.name) {
        case 'lobby':
            return '#/';
        case 'duel':
            return `#/duel/${encodeURIComponent(route.duelId)}`;
        default:
            return `#/${route.name}`;
    }
}

export function navigate(route: Route): void {
    const hash = routeHash(route);
    if (window.location.hash !== hash) {
        window.location.hash = hash;
    }
}

export function useRoute(): Route {
    const [route, setRoute] = useState(() => parseRoute(window.location.hash));
    useEffect(() => {
        const onChange = () => setRoute(parseRoute(window.location.hash));
        window.addEventListener('hashchange', onChange);
        return () => window.removeEventListener('hashchange', onChange);
    }, []);
    return route;
}
