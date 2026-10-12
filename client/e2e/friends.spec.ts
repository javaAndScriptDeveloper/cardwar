import { expect, test } from '@playwright/test';
import { invite, playToResult, result, runSuffix, signIn, status } from './helpers';

/**
 * Friends are whoever you have played. Two new players finish a friendly duel, which makes them friends; then one
 * challenges the other from the Friends screen, the challenge reaches the other's inbox (badge on the nav, a row
 * with accept), and accepting it seats both at a new table. Read from data-* attributes only.
 */
test('after a duel, one player challenges the other from Friends and the other accepts', async ({
    browser,
}) => {
    const suffix = runSuffix();
    const alice = await signIn(browser, `e2e-fa-${suffix}`);
    const code = await invite(alice, 0);
    const bob = await signIn(browser, `e2e-fb-${suffix}`, `/app/?invite=${code}`);
    await expect(status(alice)).toBeVisible();
    await expect(status(bob)).toBeVisible();

    await playToResult([alice, bob]);
    await expect(result(alice)).toBeVisible();
    await alice.getByTestId('back-to-lobby').click();
    await bob.getByTestId('back-to-lobby').click();
    await expect(bob.getByTestId('lobby-screen')).toBeVisible();

    // Alice's friends list now holds Bob, with the record of that one game.
    await alice.getByTestId('nav-friends').click();
    const row = alice.getByTestId('friend-row');
    await expect(row).toHaveCount(1);
    const bobId = (await row.getAttribute('data-player')) ?? '';
    expect(bobId).not.toBe('');
    const record = row.getByTestId('friend-record');
    const games =
        Number(await record.getAttribute('data-won')) + Number(await record.getAttribute('data-lost'));
    expect(games).toBeLessThanOrEqual(1);

    await alice.getByTestId(`challenge-${bobId}`).click();
    await alice.getByTestId('stake-0').click();
    await expect(alice.getByTestId('waiting-screen')).toHaveAttribute('data-challenge', 'true');

    // Bob's lobby polls challenges every 10 s: the badge appears, then the inbox row on the Friends screen.
    await expect(bob.getByTestId('challenges-badge')).toHaveAttribute('data-count', '1', { timeout: 30_000 });
    await bob.getByTestId('nav-friends').click();
    const challenge = bob.getByTestId('challenge-row');
    await expect(challenge).toHaveCount(1);
    await expect(challenge).toHaveAttribute('data-stake', '0');
    const inviteId = (await challenge.getAttribute('data-invite')) ?? '';
    await bob.getByTestId(`accept-${inviteId}`).click();

    await expect(status(bob)).toBeVisible();
    await expect(status(alice)).toBeVisible();
});
