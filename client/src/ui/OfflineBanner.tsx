import { useEffect, useState } from 'preact/hooks';
import { t } from '../i18n';
import { offline } from '../state/connection';

interface Props {
    /** How long the app must stay offline before the banner shows; a stream reconnecting at once is no news. */
    graceMs?: number;
}

/**
 * The app-wide "no connection" line. The live region is always in the page so screen readers announce the text
 * when it appears; it is polite and not role="alert", which belongs to the toasts (and the E2E helpers read it).
 */
export function OfflineBanner({ graceMs = 1500 }: Props) {
    const down = offline.value;
    const [shown, setShown] = useState(down && graceMs === 0);

    useEffect(() => {
        if (!down) {
            setShown(false);
            return;
        }
        if (graceMs === 0) {
            setShown(true);
            return;
        }
        const timer = setTimeout(() => setShown(true), graceMs);
        return () => clearTimeout(timer);
    }, [down, graceMs]);

    return (
        <div class="offline-live" aria-live="polite">
            {shown && (
                <p class="offline-banner" data-testid="offline-banner" data-state="offline">
                    {t('app.offline')}
                </p>
            )}
        </div>
    );
}
