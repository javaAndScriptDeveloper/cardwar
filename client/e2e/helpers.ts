import type { Browser, Page } from '@playwright/test';

/**
 * Shared steps for specs that drive the Mini App through the dev shim. Every helper reads the page through
 * data-testid and data-* attributes only, never visible copy, so the UI language can change without touching E2E.
 */

export const PASSWORD = 'correct-horse-battery';

/** A unique-enough suffix for this run's usernames, so reruns against one database never collide. */
export function runSuffix(): string {
    return `${Date.now() % 1_000_000}`;
}

/** Signs in (registering a new name) in a fresh browser context, as a separate person on a separate phone. */
export async function signIn(browser: Browser, username: string, path = '/app/'): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(path);
    await page.getByTestId('dev-username').fill(username);
    await page.getByTestId('dev-password').fill(PASSWORD);
    await page.getByTestId('dev-sign-in').click();
    return page;
}

/** Creates an invite from the lobby at `stake` and returns its code from the waiting screen. */
export async function invite(page: Page, stake: number): Promise<string> {
    await page.getByTestId('invite').click();
    await page.getByTestId(`stake-${stake}`).click();
    return ((await page.getByTestId('invite-code').textContent()) ?? '').trim();
}
