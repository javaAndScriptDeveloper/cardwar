import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Two players play a whole duel through the Mini App in two browser contexts, using the dev shim for sign-in. Every
 * decision is made from what the page exposes in data-* attributes (status state, card ids, results), never from
 * visible copy and never from the API, so the UI language can change without touching this file.
 */

const PASSWORD = 'correct-horse-battery';
const RANKS = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'];
const MAX_MOVES = 600;
/** Waiting for the other side's view to catch up does not count as a move, so the loop is bounded by time too. */
const PLAY_DEADLINE_MS = 3 * 60_000;

interface Card {
    rank: number;
    suit: string;
    id: string;
}

/** "SEVEN_OF_SPADES" -> a comparable card. */
function parse(id: string): Card {
    const [rank = '', , suit = ''] = id.split('_');
    return { rank: RANKS.indexOf(rank), suit, id };
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
    await page.getByTestId('dev-username').fill(username);
    await page.getByTestId('dev-password').fill(PASSWORD);
    await page.getByTestId('dev-sign-in').click();
    return page;
}

const status = (page: Page) => page.getByRole('status');
/** Reads the turn state without waiting: a page between screens simply has none. */
const statusState = (page: Page) =>
    page.evaluate(() => document.querySelector('[role="status"]')?.getAttribute('data-state') ?? '');
const gone = (page: Page) => page.getByTestId('duel-gone');
const handButtons = (page: Page) => page.locator('.hand button');
const pairButtons = (page: Page) => page.locator('.pairs button');
const result = (page: Page) => page.getByTestId('result');
const cardOf = (page: Page, id: string) => page.locator(`.hand button[data-card="${id}"]`);
const pairOf = (page: Page, id: string) => page.locator(`.pairs button[data-attack="${id}"]`);

async function attrs(locator: Locator, name: string): Promise<string[]> {
    return (
        await locator.evaluateAll((nodes, attr) => nodes.map((node) => node.getAttribute(attr) ?? ''), name)
    ).filter(Boolean);
}

/** Open attacks: pairs without a defence. */
async function openAttacks(page: Page): Promise<string[]> {
    return page
        .locator('.pairs button:not([data-defence])')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-attack') ?? ''));
}

/** A snapshot of what one player sees, used to notice that a move took effect. */
async function fingerprint(page: Page): Promise<string> {
    if (await result(page).isVisible()) {
        return 'over';
    }
    const pairs = await pairButtons(page).evaluateAll((nodes) =>
        nodes.map((node) => `${node.getAttribute('data-attack')}/${node.getAttribute('data-defence') ?? ''}`),
    );
    return `${await statusState(page)}|${(await attrs(handButtons(page), 'data-card')).join(',')}|${pairs.join(',')}`;
}

type Move = 'ATTACK' | 'DEFEND' | 'TAKE' | 'END_ATTACK';

/**
 * Whether the page moved on from `before` within 15 s: 'moved', or 'retry' when the page reported the move lost to
 * the network or throttled (its toast only stays up for a few seconds, so it is watched for while waiting).
 */
async function outcomeOf(page: Page, before: string): Promise<'moved' | 'retry' | 'stuck'> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if ((await fingerprint(page)) !== before) {
            return 'moved';
        }
        const alert = page.getByRole('alert');
        if (
            (await alert.isVisible()) &&
            /^(network|throttled)$/.test((await alert.getAttribute('data-reason')) ?? '')
        ) {
            return 'retry';
        }
        await page.waitForTimeout(100);
    }
    return 'stuck';
}

test('two players play a duel to a result through the Mini App', async ({ browser }) => {
    const suffix = `${Date.now() % 1_000_000}`;
    const alice = await signIn(browser, `e2e-a-${suffix}`);

    await alice.getByTestId('invite').click();
    const code = (await alice.getByTestId('invite-code').textContent())?.trim() ?? '';
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

    const played: Record<Move, number> = { ATTACK: 0, DEFEND: 0, TAKE: 0, END_ATTACK: 0 };
    let forcedTake = false;

    const deadline = Date.now() + PLAY_DEADLINE_MS;
    let moves = 0;
    while (moves < MAX_MOVES && Date.now() < deadline) {
        if ((await result(alice).isVisible()) && (await result(bob).isVisible())) {
            break;
        }
        let acted = false;
        for (const page of [alice, bob]) {
            expect(await gone(page).isVisible(), 'a player lost the duel screen').toBe(false);
            if (await result(page).isVisible()) {
                continue;
            }
            const move = await act(page, await statusState(page));
            if (move) {
                played[move]++;
                moves++;
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

    await alice.getByTestId('back-to-lobby').click();
    await expect(alice.getByTestId('invite')).toBeVisible();

    /** One greedy decision for the player whose status says it is their move; null when it is not. */
    async function act(page: Page, state: string): Promise<Move | null> {
        const before = await fingerprint(page);
        let move: Move | null = null;

        if (state === 'your-attack') {
            const cards = (await attrs(handButtons(page), 'data-card'))
                .map(parse)
                .sort((a, b) => a.rank - b.rank);
            await cardOf(page, cards[0]?.id ?? '').click();
            move = 'ATTACK';
        } else if (state === 'throw-in') {
            const throwIn = page.locator('.hand button[data-playable="true"]').first();
            if (await throwIn.count()) {
                await throwIn.click();
                move = 'ATTACK';
            } else {
                await page.getByTestId('end-attack').click();
                move = 'END_ATTACK';
            }
        } else if (state === 'defend') {
            if (!forcedTake) {
                forcedTake = true;
                await page.getByTestId('take').click();
                move = 'TAKE';
            } else {
                const trump = parse((await page.getByTestId('trump').getAttribute('data-card')) ?? '').suit;
                const open = await openAttacks(page);
                const target = parse(open[0] ?? '');
                const defence = (await attrs(handButtons(page), 'data-card'))
                    .map(parse)
                    .filter((card) => beats(target, card, trump))
                    .sort((a, b) => a.rank - b.rank)[0];
                if (defence) {
                    if (open.length > 1) {
                        await pairOf(page, target.id).click();
                    }
                    await cardOf(page, defence.id).click();
                    move = 'DEFEND';
                } else {
                    await page.getByTestId('take').click();
                    move = 'TAKE';
                }
            }
        }
        if (move) {
            const outcome = await outcomeOf(page, before);
            expect(outcome, `${move} had no effect`).not.toBe('stuck');
            if (outcome === 'retry') {
                // Lost to the network or throttled: decide again, as a player would tap again.
                return null;
            }
        }
        return move;
    }
});
