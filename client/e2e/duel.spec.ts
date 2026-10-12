import { expect, test } from '@playwright/test';
import {
    fingerprint,
    handButtons,
    invite,
    playToResult,
    result,
    signIn,
    status,
    statusState,
} from './helpers';

/**
 * Two players play a whole duel through the Mini App in two browser contexts, using the dev shim for sign-in. Every
 * decision is made from what the page exposes in data-* attributes (status state, card ids, results), never from
 * visible copy and never from the API, so the UI language can change without touching this file.
 */

test('two players play a 100-coin duel to a result through the Mini App', async ({ browser }) => {
    const suffix = `${Date.now() % 1_000_000}`;
    const alice = await signIn(browser, `e2e-a-${suffix}`);

    await expect(alice.getByTestId('balance')).toHaveAttribute('data-balance', '500');
    const code = await invite(alice, 100);
    await expect(alice.getByTestId('invite-stake')).toHaveAttribute('data-stake', '100');
    expect(code).toMatch(/^[0-9a-f-]{36}$/);

    // Bob arrives through the invite link, as a friend tapping it in Telegram would (start_param in the shim).
    const bob = await signIn(browser, `e2e-b-${suffix}`, `/app/?invite=${code}`);
    await expect(status(bob)).toBeVisible();
    await expect(status(alice)).toBeVisible();

    // The defender taps a card while it is not their move: the engine refuses, the toast says so, nothing changes.
    const defender = (await statusState(alice)) === 'waiting-attack' ? alice : bob;
    const before = await fingerprint(defender);
    await handButtons(defender).first().click();
    await expect(defender.getByRole('alert')).toHaveAttribute('data-reason', 'NOT_YOUR_TURN');
    expect(await fingerprint(defender)).toBe(before);

    const played = await playToResult([alice, bob], { forceTake: true });

    const outcomes = [
        await result(alice).getAttribute('data-result'),
        await result(bob).getAttribute('data-result'),
    ].sort();
    expect([
        ['DRAW', 'DRAW'],
        ['LOST', 'WON'],
    ]).toContainEqual(outcomes);
    expect(played.ATTACK).toBeGreaterThan(0);
    expect(played.DEFEND).toBeGreaterThan(0);
    expect(played.TAKE).toBeGreaterThan(0);
    expect(played.END_ATTACK).toBeGreaterThan(0);

    // The winner takes the pot; a draw refunds both.
    const aliceResult = (await result(alice).getAttribute('data-result')) ?? '';
    const expectedDelta = { WON: '100', LOST: '-100', DRAW: '0' }[aliceResult] ?? '?';
    if (aliceResult !== 'DRAW') {
        await expect(alice.getByTestId('coin-delta')).toHaveAttribute('data-delta', expectedDelta);
    }
    await alice.getByTestId('back-to-lobby').click();
    await expect(alice.getByTestId('invite')).toBeVisible();
    await expect(alice.getByTestId('balance')).toHaveAttribute(
        'data-balance',
        String(500 + Number(expectedDelta)),
    );
});
