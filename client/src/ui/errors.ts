import { ApiError } from '../api/client';

/** A short, human sentence for any failure; the engine's reason code wins when there is one. */
export function describeError(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 0) {
            return 'no connection';
        }
        return error.reason ?? error.detail ?? `error ${error.status}`;
    }
    return error instanceof Error ? error.message : 'something went wrong';
}
