import { afterEach, describe, expect, it, vi } from 'vitest';
import { offline, reportRequest, resetConnection, trackStreams, watchBrowser } from './connection';

afterEach(() => resetConnection());

describe('connection', () => {
    it('goes offline when a request gets no answer and back when the next one does', () => {
        expect(offline.value).toBe(false);

        reportRequest(false);
        expect(offline.value).toBe(true);

        reportRequest(true);
        expect(offline.value).toBe(false);
    });

    it('follows the browser online and offline events until unwatched', () => {
        const target = new EventTarget();
        const unwatch = watchBrowser(target, true);

        target.dispatchEvent(new Event('offline'));
        expect(offline.value).toBe(true);
        target.dispatchEvent(new Event('online'));
        expect(offline.value).toBe(false);

        unwatch();
        target.dispatchEvent(new Event('offline'));
        expect(offline.value).toBe(false);
    });

    it('starts offline when the browser already says so', () => {
        const unwatch = watchBrowser(new EventTarget(), false);
        expect(offline.value).toBe(true);

        // Unwatching forgets the browser state rather than leave a banner nobody can clear.
        unwatch();
        expect(offline.value).toBe(false);
    });

    it('counts a reconnecting duel stream as offline until it is live or closed', () => {
        type Options = { onStatus?: (status: 'live' | 'reconnecting') => void };
        let status: Options['onStatus'];
        const close = vi.fn();
        const open = trackStreams<Options>((_duelId, options) => {
            status = options.onStatus;
            return close;
        });
        const seen: string[] = [];

        const stop = open('d1', { onStatus: (s) => seen.push(s) });
        status?.('reconnecting');
        expect(offline.value).toBe(true);
        status?.('live');
        expect(offline.value).toBe(false);

        status?.('reconnecting');
        stop();
        expect(offline.value).toBe(false);
        expect(close).toHaveBeenCalled();
        expect(seen).toEqual(['reconnecting', 'live', 'reconnecting']);
    });

    it('stops counting a stream the server refused, which never reconnects', () => {
        type Options = {
            onStatus?: (status: 'live' | 'reconnecting') => void;
            onClosed?: (status: number) => void;
        };
        let given: Options = {};
        const open = trackStreams<Options>((_duelId, options) => {
            given = options;
            return () => {};
        });
        const onClosed = vi.fn();

        open('d1', { onClosed });
        given.onStatus?.('reconnecting');
        given.onClosed?.(404);

        expect(offline.value).toBe(false);
        expect(onClosed).toHaveBeenCalledWith(404);
    });
});
