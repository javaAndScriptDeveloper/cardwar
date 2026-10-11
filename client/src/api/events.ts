import { API_BASE, type FetchLike } from './client';
import type { DuelEvent } from './types';

export type StreamStatus = 'live' | 'reconnecting';

export interface DuelStreamOptions {
    fetchImpl: FetchLike;
    /** Read on every (re)connect so a refreshed token is picked up. */
    headers: () => Headers;
    /**
     * Called on every event, and with no event after every successful (re)connect. The stream is only a nudge: the
     * caller re-fetches the duel over REST each time, so events missed while disconnected cannot leave stale state.
     */
    onNudge: (event?: DuelEvent) => void;
    onStatus?: (status: StreamStatus) => void;
    /** The server refused the stream (403/404: duel finished or not ours); no reconnect follows. */
    onClosed?: (status: number) => void;
    initialBackoffMs?: number;
    maxBackoffMs?: number;
}

/**
 * Server-sent events for one duel over `fetch` rather than `EventSource`, because EventSource cannot send the
 * Authorization header and the API authenticates every request with a bearer token. Returns `close`.
 */
export function openDuelStream(duelId: string, options: DuelStreamOptions): () => void {
    const initialBackoff = options.initialBackoffMs ?? 500;
    const maxBackoff = options.maxBackoffMs ?? 10_000;
    let backoff = initialBackoff;
    let closed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
        if (closed) {
            return;
        }
        options.onStatus?.('reconnecting');
        timer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, maxBackoff);
    };

    async function connect() {
        controller = new AbortController();
        const headers = options.headers();
        headers.set('Accept', 'text/event-stream');
        try {
            const response = await options.fetchImpl(
                `${API_BASE}/duels/${encodeURIComponent(duelId)}/events`,
                {
                    headers,
                    signal: controller.signal,
                },
            );
            if (response.status === 403 || response.status === 404) {
                closed = true;
                options.onClosed?.(response.status);
                return;
            }
            if (!response.ok || !response.body) {
                scheduleReconnect();
                return;
            }
            backoff = initialBackoff;
            options.onStatus?.('live');
            options.onNudge();
            await readEvents(response.body, options.onNudge);
        } catch {
            // Aborted by close(), or the network dropped: both end up below.
        }
        scheduleReconnect();
    }

    void connect();

    return () => {
        closed = true;
        clearTimeout(timer);
        controller?.abort();
    };
}

/** Parses the SSE wire format: frames separated by a blank line, `data:` lines carrying JSON, `:` comments. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: DuelEvent) => void) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            return;
        }
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n');
            if (data) {
                try {
                    onEvent(JSON.parse(data) as DuelEvent);
                } catch {
                    // Not ours to interpret; a malformed frame must not kill the stream.
                }
            }
            boundary = buffer.indexOf('\n\n');
        }
    }
}
