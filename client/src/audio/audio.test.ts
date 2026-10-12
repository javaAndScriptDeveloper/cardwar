import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../state/settings';
import { AudioManager } from './index';

function fakeContext() {
    const source = { buffer: null as unknown, connect: vi.fn(), start: vi.fn() };
    const gain = { gain: { value: 1 }, connect: vi.fn() };
    const ctx = {
        state: 'suspended',
        resume: vi.fn(function (this: { state: string }) {
            this.state = 'running';
            return Promise.resolve();
        }),
        decodeAudioData: vi.fn().mockResolvedValue({ duration: 0.1 }),
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => gain),
        destination: {},
    };
    return { ctx: ctx as unknown as AudioContext, source, gain };
}

const okFetch = () => vi.fn().mockResolvedValue(new Response(new ArrayBuffer(8))) as unknown as typeof fetch;

async function unlock(audio: AudioManager) {
    const target = new EventTarget();
    audio.installUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(audio.unlocked).toBe(true));
}

describe('AudioManager', () => {
    beforeEach(() => {
        settings.value = DEFAULT_SETTINGS;
    });

    it('is a no-op before unlock, then plays after the first gesture, de-duping bursts', async () => {
        const { ctx, source } = fakeContext();
        let now = 0;
        const audio = new AudioManager({ context: () => ctx, fetchImpl: okFetch(), now: () => now });
        audio.register('beat', '/x/beat.wav');

        audio.play('beat');
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(source.start).not.toHaveBeenCalled();

        await unlock(audio);
        audio.play('beat');
        await vi.waitFor(() => expect(source.start).toHaveBeenCalledTimes(1));
        now = 100;
        audio.play('beat');
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(source.start).toHaveBeenCalledTimes(1);
        now = 400;
        audio.play('beat');
        await vi.waitFor(() => expect(source.start).toHaveBeenCalledTimes(2));
    });

    it('fetches and decodes each sound once', async () => {
        const { ctx } = fakeContext();
        const fetchImpl = okFetch();
        let now = 0;
        const audio = new AudioManager({ context: () => ctx, fetchImpl, now: () => now });
        audio.register('beat', '/x/beat.wav');
        await unlock(audio);

        audio.play('beat');
        now = 1000;
        audio.play('beat');
        await vi.waitFor(() =>
            expect(
                (ctx.decodeAudioData as unknown as { mock: { calls: unknown[] } }).mock.calls,
            ).toHaveLength(1),
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('respects the sound and music settings per channel', async () => {
        const { ctx, source } = fakeContext();
        const audio = new AudioManager({ context: () => ctx, fetchImpl: okFetch() });
        audio.register('beat', '/x/beat.wav');
        audio.register('theme', '/x/theme.wav', 'music');
        await unlock(audio);

        settings.value = { ...DEFAULT_SETTINGS, sound: false, music: true };
        audio.play('beat');
        audio.play('theme');
        await vi.waitFor(() => expect(source.start).toHaveBeenCalledTimes(1));
    });

    it('does nothing when no AudioContext is available', async () => {
        const audio = new AudioManager({ context: () => undefined });
        audio.register('beat', '/x/beat.wav');
        const target = new EventTarget();
        audio.installUnlock(target);
        target.dispatchEvent(new Event('pointerdown'));

        expect(() => audio.play('beat')).not.toThrow();
        expect(audio.unlocked).toBe(false);
    });

    it('swallows a failed download', async () => {
        const { ctx, source } = fakeContext();
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
        const audio = new AudioManager({ context: () => ctx, fetchImpl });
        audio.register('beat', '/x/beat.wav');
        await unlock(audio);

        audio.play('beat');
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(source.start).not.toHaveBeenCalled();
    });
});
