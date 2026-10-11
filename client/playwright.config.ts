import { defineConfig, devices } from '@playwright/test';

// Drives the real stack (nginx + app + Postgres + Redis): start it with `make up` from the repository root first.
// E2E_BASE_URL points elsewhere, e.g. at a deployed host; the default accepts the local self-signed certificate.
export default defineConfig({
    testDir: 'e2e',
    timeout: 5 * 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'https://localhost',
        ignoreHTTPSErrors: true,
        ...devices['Pixel 7'],
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'mobile-chromium' }],
});
