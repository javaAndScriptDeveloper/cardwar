import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Two players play a whole duel through the Mini App in two browser contexts, using the dev shim for sign-in. Every
 * decision is made from what the page shows (status line, card labels, the trump card), never from the API.
 */

const PASSWORD = 'correct-horse-battery';
const RANKS = ['Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const MAX_ACTIONS = 600;

interface Card {
    rank: number;
    suit: string;
    label: string;
}

/** "Seven of Spades" -> a comparable card. */
function parse(label: string): Card {
    const [rank = '', , suit = ''] = label.split(' ');
    return { rank: RANKS.indexOf(rank), suit, label };
}

/** Same relation as DurakRules.beats, applied to what the page shows. */
function beats(attack: Card, defence: Card, trump: string): boolean {
    if (attack.suit === trump) {
        return defence.suit === trump && defence.rank > attack.rank;
    }
    return defence.suit === trump || (defence.suit === attack.suit && defence.rank > attack.rank);
}

async function signIn(browser: Browser, username: string, path = '/app/'): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(path);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    return page;
}

const status = (page: Page) => page.getByRole('status');
const handButtons = (page: Page) => page.locator('.hand button');
const result = (page: Page) => page.getByRole('heading', { name: /^(You won|You lost|Draw)$/ });

async function labels(locator: Locator): Promise<string[]> {
    return (
        await locator.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
    ).filter(Boolean);
}

/** A snapshot of what one player sees, used to notice that a move took effect. */
async function fingerprint(page: Page): Promise<string> {
    if (await result(page).isVisible()) {
        return 'over';
    }
    const text =
        (await status(page)
            .textContent()
            .catch(() => '')) ?? '';
    return `${text}|${(await labels(handButtons(page))).join(',')}|${(await labels(page.locator('.pairs button'))).join(',')}`;
}

type Move = 'ATTACK' | 'DEFEND' | 'TAKE' | 'END_ATTACK';

test('two players play a duel to a result through the Mini App', async ({ browser }) => {
    const suffix = `${Date.now() % 1_000_000}`;
    const alice = await signIn(browser, `e2e-a-${suffix}`);

    await alice.getByRole('button', { name: 'Invite a friend' }).click();
    const code = (await alice.getByTestId('invite-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[0-9a-f-]{36}$/);

    // Bob arrives through the invite link, as a friend tapping it in Telegram would (start_param in the shim).
    const bob = await signIn(browser, `e2e-b-${suffix}`, `/app/?invite=${code}`);
    await expect(status(bob)).toBeVisible();
    await expect(status(alice)).toBeVisible();

    // The defender taps a card while it is not their move: the engine refuses, the toast says so, nothing changes.
    const defender = (await status(alice).textContent())?.startsWith('Waiting') ? alice : bob;
    const before = await fingerprint(defender);
    await handButtons(defender).first().click();
    await expect(defender.getByRole('alert')).toHaveText('Not your turn.');
    expect(await fingerprint(defender)).toBe(before);

    const played: Record<Move, number> = { ATTACK: 0, DEFEND: 0, TAKE: 0, END_ATTACK: 0 };
    let forcedTake = false;

    for (let action = 0; action < MAX_ACTIONS; action++) {
        if ((await result(alice).isVisible()) && (await result(bob).isVisible())) {
            break;
        }
        let acted = false;
        for (const page of [alice, bob]) {
            if (await result(page).isVisible()) {
                continue;
            }
            const text =
                (await status(page)
                    .textContent()
                    .catch(() => null)) ?? '';
            const move = await act(page, text);
            if (move) {
                played[move]++;
                acted = true;
                break;
            }
        }
        if (!acted) {
            // Nobody can move yet: the other side's view is catching up through the event stream.
            await alice.waitForTimeout(150);
        }
    }

    await expect(result(alice)).toBeVisible();
    await expect(result(bob)).toBeVisible();
    const outcomes = [await result(alice).textContent(), await result(bob).textContent()].sort();
    expect([
        ['Draw', 'Draw'],
        ['You lost', 'You won'],
    ]).toContainEqual(outcomes);
    expect(played.ATTACK).toBeGreaterThan(0);
    expect(played.DEFEND).toBeGreaterThan(0);
    expect(played.TAKE).toBeGreaterThan(0);
    expect(played.END_ATTACK).toBeGreaterThan(0);

    await alice.getByRole('button', { name: 'Back to start' }).click();
    await expect(alice.getByRole('button', { name: 'Invite a friend' })).toBeVisible();

    /** One greedy decision for the player whose status says it is their move; null when it is not. */
    async function act(page: Page, text: string): Promise<Move | null> {
        const before = await fingerprint(page);
        let move: Move | null = null;

        if (text === 'Your attack') {
            const cards = (await labels(handButtons(page))).map(parse).sort((a, b) => a.rank - b.rank);
            await page.getByRole('button', { name: cards[0]?.label ?? '', exact: true }).click();
            move = 'ATTACK';
        } else if (text === 'Throw in or end the attack') {
            const throwIn = page.locator('.hand button[data-playable="true"]').first();
            if (await throwIn.count()) {
                await throwIn.click();
                move = 'ATTACK';
            } else {
                await page.getByRole('button', { name: 'End attack' }).click();
                move = 'END_ATTACK';
            }
        } else if (text === 'Defend') {
            if (!forcedTake) {
                forcedTake = true;
                await page.getByRole('button', { name: 'Take' }).click();
                move = 'TAKE';
            } else {
                const trumpAlt = (await page.locator('.deck .trump').getAttribute('alt')) ?? '';
                const trump = parse(trumpAlt).suit;
                const open = (await labels(page.locator('.pairs button'))).filter(
                    (label) => !label.includes('beaten by'),
                );
                const target = parse(open[0] ?? '');
                const defence = (await labels(handButtons(page)))
                    .map(parse)
                    .filter((card) => beats(target, card, trump))
                    .sort((a, b) => a.rank - b.rank)[0];
                if (defence) {
                    if (open.length > 1) {
                        await page.getByRole('button', { name: target.label, exact: true }).click();
                    }
                    await page.getByRole('button', { name: defence.label, exact: true }).click();
                    move = 'DEFEND';
                } else {
                    await page.getByRole('button', { name: 'Take' }).click();
                    move = 'TAKE';
                }
            }
        }
        if (move) {
            await expect.poll(() => fingerprint(page), { timeout: 15_000 }).not.toBe(before);
        }
        return move;
    }
});
