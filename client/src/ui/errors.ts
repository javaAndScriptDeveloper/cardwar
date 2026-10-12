import { ApiError } from '../api/client';
import { t } from '../i18n';

/** A short, human sentence for any failure; the engine's reason code wins when there is one. */
export function describeError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 0) {
            return t('error.noConnection');
        }
        if (error.status === 429) {
            return t('error.throttled');
        }
        return error.reason ?? error.detail ?? t('error.http', { status: error.status });
    }
    return error instanceof Error ? error.message : t('error.generic');
}
