import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../state/settings';
import { animate, flyTo, motionEnabled } from './index';

function withAnimate(
    el: HTMLElement,
    impl = vi.fn().mockReturnValue({ finished: Promise.resolve(), cancel() {} }),
) {
    Object.defineProperty(el, 'animate', { value: impl, configurable: true });
    return impl;
}

describe('motion', () => {
    beforeEach(() => {
        settings.value = DEFAULT_SETTINGS;
    });

    it('calls Element.animate with keyframes when enabled', async () => {
        const el = document.createElement('div');
        const spy = withAnimate(el);

        await animate(el, 'beat');

        expect(spy).toHaveBeenCalledTimes(1);
        const [frames, options] = spy.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
        expect(Array.isArray(frames)).toBe(true);
        expect(frames.length).toBeGreaterThan(1);
        expect(options.duration).toBeGreaterThan(0);
    });

    it('is a no-op when reduced motion is on', async () => {
        settings.value = { ...DEFAULT_SETTINGS, reducedMotion: true };
        const el = document.createElement('div');
        const spy = withAnimate(el);

        await animate(el, 'shake');

        expect(spy).not.toHaveBeenCalled();
        expect(motionEnabled()).toBe(false);
    });

    it('resolves when animate is unavailable', async () => {
        const el = document.createElement('div');
        Object.defineProperty(el, 'animate', { value: undefined, configurable: true });

        await expect(animate(el, 'pulse')).resolves.toBeUndefined();
    });

    it('resolves even when the animation is cancelled', async () => {
        const el = document.createElement('div');
        withAnimate(
            el,
            vi.fn().mockReturnValue({ finished: Promise.reject(new Error('AbortError')), cancel() {} }),
        );

        await expect(animate(el, 'deal')).resolves.toBeUndefined();
    });

    it('flyTo glides from the target rect to the element rect', async () => {
        const el = document.createElement('div');
        const target = document.createElement('div');
        el.getBoundingClientRect = () => ({ left: 100, top: 200 }) as DOMRect;
        target.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
        const spy = withAnimate(el);

        await flyTo(el, target);

        const [frames] = spy.mock.calls[0] as [Keyframe[]];
        expect(frames[0]?.['transform']).toBe('translate(-90px, -180px)');
        expect(frames[1]?.['transform']).toBe('translate(0px, 0px)');
    });
});
