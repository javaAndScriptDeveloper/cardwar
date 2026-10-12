import { signal } from '@preact/signals';

/**
 * Server clock minus this device's clock, in ms, as last measured from a response's `Date` header. Move deadlines
 * are server instants; a phone whose clock is off by half a minute would otherwise show a timer that is wrong by
 * as much.
 */
export const serverOffset = signal(0);

/** The server's "now" as best this device can tell. */
export function serverNow(): number {
    return Date.now() + serverOffset.value;
}
