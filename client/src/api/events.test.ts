import { describe, expect, it, vi } from 'vitest';
import { openDuelStream } from './events';

const encoder = new TextEncoder();

/** A response whose body yields the given chunks and then ends, like a dropped connection. */
function streamOf(chunks: string[], status = 200): Response {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
    return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

/** A response that stays open until the request is aborted. */
function openStream(init?: RequestInit, chunks: string[] = []): Response {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
            );
        },
    });
    return new Response(body, { status: 200 });
}

const headers = () => new Headers({ Authorization: 'Bearer t' });

describe('openDuelStream', () => {
    it('nudges on connect and on every event, ignoring keepalive comments, across split chunks', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce((_url: string, init: RequestInit) =>
                Promise.resolve(
                    openStream(init, [
                        ':keepalive\n\n',
                        'event:duel\ndata:{"type":"CARD_PL',
                        'AYED","duelId":"d1"}\n\nevent:duel\r\ndata:{"type":"ROUND_ENDED","duelId":"d1"}\r\n\r\n',
                    ]),
                ),
            );
        const onNudge = vi.fn();

        const close = openDuelStream('d1', { fetchImpl: fetchMock, headers, onNudge });

        await vi.waitFor(() => expect(onNudge).toHaveBeenCalledTimes(3));
        expect(onNudge.mock.calls.map(([event]) => (event as { type: string } | undefined)?.type)).toEqual([
            undefined,
            'CARD_PLAYED',
            'ROUND_ENDED',
        ]);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/v1/duels/d1/events');
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer t');
        expect(new Headers(init.headers).get('Accept')).toBe('text/event-stream');
        close();
    });

    it('reconnects after the connection drops, nudging again so missed moves are re-fetched', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(streamOf(['data:{"type":"CARD_PLAYED","duelId":"d1"}\n\n']))
            .mockRejectedValueOnce(new TypeError('network down'))
            .mockImplementation((_url: string, init: RequestInit) => Promise.resolve(openStream(init)));
        const onNudge = vi.fn();
        const onStatus = vi.fn();

        const close = openDuelStream('d1', {
            fetchImpl: fetchMock,
            headers,
            onNudge,
            onStatus,
            initialBackoffMs: 1,
            maxBackoffMs: 4,
        });

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        await vi.waitFor(() => expect(onNudge).toHaveBeenCalledTimes(3));
        expect(onStatus).toHaveBeenCalledWith('reconnecting');
        expect(onStatus).toHaveBeenLastCalledWith('live');
        close();
    });

    it('stops for good when the duel is gone or not ours', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
        const onClosed = vi.fn();

        openDuelStream('d1', {
            fetchImpl: fetchMock,
            headers,
            onNudge: vi.fn(),
            onClosed,
            initialBackoffMs: 1,
        });

        await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith(404));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('closing aborts the request and never reconnects', async () => {
        let captured: RequestInit | undefined;
        const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            captured = init;
            return Promise.resolve(openStream(init));
        });
        const onNudge = vi.fn();

        const close = openDuelStream('d1', { fetchImpl: fetchMock, headers, onNudge, initialBackoffMs: 1 });
        await vi.waitFor(() => expect(onNudge).toHaveBeenCalledTimes(1));
        close();

        expect(captured?.signal?.aborted).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
