import { act, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { reportRequest, resetConnection } from '../state/connection';
import { OfflineBanner } from './OfflineBanner';

afterEach(() => {
    resetConnection();
    vi.useRealTimers();
});

describe('OfflineBanner', () => {
    it('says there is no connection while offline, politely, and goes away once back', () => {
        render(<OfflineBanner graceMs={0} />);
        expect(screen.queryByTestId('offline-banner')).toBeNull();

        act(() => reportRequest(false));
        const banner = screen.getByTestId('offline-banner');
        expect(banner.textContent).toBe(t('app.offline'));
        expect(banner.closest('[aria-live="polite"]')).not.toBeNull();
        // Toasts own role="alert" (the E2E helpers read it), and the duel status owns role="status".
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByRole('status')).toBeNull();

        act(() => reportRequest(true));
        expect(screen.queryByTestId('offline-banner')).toBeNull();
    });

    it('ignores a blip shorter than the grace period, such as a stream reconnecting at once', () => {
        vi.useFakeTimers();
        render(<OfflineBanner graceMs={1000} />);

        act(() => reportRequest(false));
        act(() => {
            vi.advanceTimersByTime(500);
        });
        act(() => reportRequest(true));
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.queryByTestId('offline-banner')).toBeNull();

        act(() => reportRequest(false));
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.getByTestId('offline-banner')).toBeTruthy();
    });
});
