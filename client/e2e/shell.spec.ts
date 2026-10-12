import { expect, test, type Page } from '@playwright/test';

/**
 * The app shell outside a duel: tabs, settings that survive a reload, and a pending invite that comes back after
 * the Mini App is reopened (Telegram reloads it whenever the player switches to a chat).
 */

const PASSWORD = 'correct-horse-battery';

/** Signs in through the dev shim; with no path the current page is reloaded (a hash-only goto would not reload). */
async function signInAs(page: Page, username: string, path?: string): Promise<void> {
    if (path) {
        await page.goto(path);
    } else {
        await page.reload();
    }
    await page.getByTestId('dev-username').fill(username);
    await page.getByTestId('dev-password').fill(PASSWORD);
    await page.getByTestId('dev-sign-in').click();
}

test('the shell navigates, remembers settings and resumes a pending invite', async ({ page }) => {
    const username = `e2e-s-${Date.now() % 1_000_000}`;
    await signInAs(page, username, '/app/');
    await expect(page.getByTestId('invite')).toBeVisible();
    await expect(page.getByTestId('nav-lobby')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('nav-friends').click();
    await expect(page.getByTestId('friends-screen')).toBeVisible();
    await page.getByTestId('nav-shop').click();
    await expect(page.getByTestId('shop-screen')).toBeVisible();
    await page.getByTestId('nav-profile').click();
    await expect(page.getByTestId('profile-screen')).toBeVisible();
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await expect(page.getByTestId('nav-lobby')).toHaveCount(0);

    // Settings are per device: they must survive a reload (which, in the dev shim, means signing in again).
    await page.getByTestId('setting-sound').uncheck();
    await signInAs(page, username);
    await expect(page.getByTestId('setting-sound')).not.toBeChecked();

    // A pending invite belongs to the player, not to the page: reopening the app shows the same code.
    await page.evaluate(() => {
        window.location.hash = '#/';
    });
    await page.getByTestId('invite').click();
    const code = (await page.getByTestId('invite-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[0-9a-f-]{36}$/);
    await signInAs(page, username);
    await expect(page.getByTestId('invite-code')).toHaveText(code);

    await page.getByTestId('cancel-invite').click();
    await expect(page.getByTestId('invite')).toBeVisible();
});
