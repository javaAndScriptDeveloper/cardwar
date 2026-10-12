import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two strangers find each other through quick match at the friendly table and land at the same duel with the move
 * clock running. The duel itself is played out by duel.spec.ts; this only proves the pairing and the clock.
 */

const PASSWORD = 'correct-horse-battery';

async function signIn(browser: Browser, username: string): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/app/');
    await page.getByTestId('dev-username').fill(username);
    await page.getByTestId('dev-password').fill(PASSWORD);
    await page.getByTestId('dev-sign-in').click();
    return page;
}

async function quickMatch(page: Page): Promise<void> {
    await page.getByTestId('quick-match').click();
    await page.getByTestId('stake-0').click();
}

/** The duel id from the route (#/duel/<id>), so both players can be shown to sit at the same table. */
const duelIdOf = (page: Page) => new URL(page.url()).hash.replace(/^#\/duel\//, '');

test('two players quick-match at the friendly table and see the move clock', async ({ browser }) => {
    const suffix = Date.now() % 1_000_000;
    const alice = await signIn(browser, `e2e-qa-${suffix}`);
    const bob = await signIn(browser, `e2e-qb-${suffix}`);

    await quickMatch(alice);
    await expect(alice.getByTestId('searching-screen')).toBeVisible();
    await expect(alice.getByTestId('search-stake')).toHaveAttribute('data-stake', '0');
    await quickMatch(bob);

    for (const page of [alice, bob]) {
        await expect(page.getByRole('status')).toBeVisible({ timeout: 20_000 });
    }
    expect(duelIdOf(alice)).not.toBe('');
    expect(duelIdOf(alice)).toBe(duelIdOf(bob));

    for (const page of [alice, bob]) {
        const timer = page.getByTestId('move-timer');
        await expect(timer).toBeVisible();
        const seconds = Number(await timer.getAttribute('data-seconds'));
        expect(seconds).toBeGreaterThanOrEqual(1);
        expect(seconds).toBeLessThanOrEqual(30);
    }
    const sides = await Promise.all(
        [alice, bob].map((page) => page.getByTestId('move-timer').getAttribute('data-to-move')),
    );
    expect(sides.sort()).toEqual(['opponent', 'you']);
});
