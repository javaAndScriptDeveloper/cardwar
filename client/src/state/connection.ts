import { computed, signal } from '@preact/signals';

/**
 * Whether the app can reach the server, from three witnesses: the last API request (no answer at all, not an HTTP
 * error, which is the server answering), the browser's own online/offline events, and open duel streams that are
 * reconnecting. Any one of them failing is enough to say so; the banner reads `offline`.
 */
const requestFailed = signal(false);
const browserOffline = signal(false);
const reconnectingStreams = signal(0);

export const offline = computed(
    () => requestFailed.value || browserOffline.value || reconnectingStreams.value > 0,
);

/** `answered` is false when the request got no response at all (fetch rejected). */
export function reportRequest(answered: boolean): void {
    requestFailed.value = !answered;
}

/** Follows `online`/`offline` events on `target` (the window) until the returned function is called. */
export function watchBrowser(target: EventTarget, onLine: boolean): () => void {
    browserOffline.value = !onLine;
    const goOnline = () => {
        browserOffline.value = false;
    };
    const goOffline = () => {
        browserOffline.value = true;
    };
    target.addEventListener('online', goOnline);
    target.addEventListener('offline', goOffline);
    return () => {
        target.removeEventListener('online', goOnline);
        target.removeEventListener('offline', goOffline);
        browserOffline.value = false;
    };
}

type StreamStatus = 'live' | 'reconnecting';

/**
 * Wraps a duel-stream opener so each stream's state feeds `offline`: reconnecting counts until it is live again or
 * closed or refused, so leaving a duel mid-reconnect does not leave the banner up.
 */
export function trackStreams<
    O extends { onStatus?: (status: StreamStatus) => void; onClosed?: (status: number) => void },
>(open: (duelId: string, options: O) => () => void): (duelId: string, options: O) => () => void {
    return (duelId, options) => {
        let reconnecting = false;
        const mark = (now: boolean) => {
            if (now !== reconnecting) {
                reconnecting = now;
                reconnectingStreams.value += now ? 1 : -1;
            }
        };
        const close = open(duelId, {
            ...options,
            onStatus: (status: StreamStatus) => {
                mark(status === 'reconnecting');
                options.onStatus?.(status);
            },
            // A refused stream (duel over, not ours) never reconnects: that is an answer, not a lost connection.
            onClosed: (status: number) => {
                mark(false);
                options.onClosed?.(status);
            },
        });
        return () => {
            mark(false);
            close();
        };
    };
}

/** Back to "connected"; for tests, which share these module-level signals. */
export function resetConnection(): void {
    requestFailed.value = false;
    browserOffline.value = false;
    reconnectingStreams.value = 0;
}
