import { act, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverOffset } from '../state/clock';
import { MoveTimer } from './MoveTimer';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const inSeconds = (s: number) => new Date(NOW + s * 1000).toISOString();
const timer = () => screen.getByTestId('move-timer');

describe('MoveTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        serverOffset.value = 0;
    });
    afterEach(() => {
        vi.useRealTimers();
        serverOffset.value = 0;
    });

    it('shows whose clock runs and the whole seconds left', () => {
        render(<MoveTimer deadline={inSeconds(20)} side="opponent" />);

        expect(timer().getAttribute('data-to-move')).toBe('opponent');
        expect(timer().getAttribute('data-seconds')).toBe('20');
        expect(timer().classList.contains('urgent')).toBe(false);
    });

    it('ticks down, shrinks and turns urgent at ten seconds', () => {
        render(<MoveTimer deadline={inSeconds(20)} side="you" />);
        const width = () => (timer().querySelector('.move-timer-fill') as HTMLElement).style.width;
        const before = width();

        act(() => {
            vi.advanceTimersByTime(10_250);
        });

        expect(timer().getAttribute('data-seconds')).toBe('10');
        expect(timer().classList.contains('urgent')).toBe(true);
        expect(parseFloat(width())).toBeLessThan(parseFloat(before));
    });

    it('never goes below zero', () => {
        render(<MoveTimer deadline={inSeconds(1)} side="you" />);

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(timer().getAttribute('data-seconds')).toBe('0');
    });

    it("counts on the server's clock, not the device's", () => {
        serverOffset.value = 5000;

        render(<MoveTimer deadline={inSeconds(20)} side="you" />);

        expect(timer().getAttribute('data-seconds')).toBe('15');
    });

    it('warns once at ten and once at five seconds on your own clock', () => {
        const onWarning = vi.fn();
        render(<MoveTimer deadline={inSeconds(12)} side="you" onWarning={onWarning} />);

        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(onWarning).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(onWarning).toHaveBeenCalledWith('ten');
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(onWarning).toHaveBeenCalledWith('five');
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(onWarning.mock.calls).toEqual([['ten'], ['five']]);
    });

    it("stays quiet on the opponent's clock", () => {
        const onWarning = vi.fn();
        render(<MoveTimer deadline={inSeconds(12)} side="opponent" onWarning={onWarning} />);

        act(() => {
            vi.advanceTimersByTime(12_000);
        });

        expect(onWarning).not.toHaveBeenCalled();
    });

    it('a new deadline re-arms the warnings', () => {
        const onWarning = vi.fn();
        const { rerender } = render(<MoveTimer deadline={inSeconds(9)} side="you" onWarning={onWarning} />);
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(onWarning.mock.calls).toEqual([['ten']]);

        rerender(<MoveTimer deadline={inSeconds(40)} side="you" onWarning={onWarning} />);
        act(() => {
            vi.advanceTimersByTime(30_250);
        });

        expect(onWarning.mock.calls).toEqual([['ten'], ['ten']]);
    });
});
