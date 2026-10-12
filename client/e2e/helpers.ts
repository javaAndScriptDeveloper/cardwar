import { expect, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Shared steps for specs that drive the Mini App through the dev shim. Every helper reads the page through
 * data-testid and data-* attributes only, never visible copy, so the UI language can change without touching E2E.
 */

export const PASSWORD = 'correct-horse-battery';

/** A unique-enough suffix for this run's usernames, so reruns against one database never collide. */
export function runSuffix(): string {
    return `${Date.now() % 1_000_000}`;
}

/**
 * Fills and submits the dev-shim login on `page`. Sign-ins are rate limited per address (10 a minute, as in
 * production), and a full E2E run signs in more often than that from one machine, so a throttled attempt waits for the
 * bucket to refill and tries again, as a patient person would, instead of loosening the limit for tests.
 */
export async function submitDevLogin(page: Page, username: string): Promise<void> {
    await page.getByTestId('dev-username').fill(username);
    await page.getByTestId('dev-password').fill(PASSWORD);
    for (let attempt = 1; ; attempt++) {
        await page.getByTestId('dev-sign-in').click();
        const signedIn = page.getByTestId('dev-sign-in').waitFor({ state: 'detached', timeout: 15_000 });
        const refused = page.getByRole('alert').waitFor({ state: 'visible', timeout: 15_000 });
        const outcome = await Promise.race([signedIn.then(() => 'in'), refused.then(() => 'refused')]).catch(
            () => 'in',
        );
        if (outcome === 'in' || attempt >= 3) {
            return;
        }
        await page.waitForTimeout(61_000);
    }
}

/** Signs in (registering a new name) in a fresh browser context, as a separate person on a separate phone. */
export async function signIn(browser: Browser, username: string, path = '/app/'): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(path);
    await submitDevLogin(page, username);
    return page;
}

/** Creates an invite from the lobby at `stake` and returns its code from the waiting screen. */
export async function invite(page: Page, stake: number): Promise<string> {
    await page.getByTestId('invite').click();
    await page.getByTestId(`stake-${stake}`).click();
    return ((await page.getByTestId('invite-code').textContent()) ?? '').trim();
}

const RANKS = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'];

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

export const status = (page: Page) => page.getByRole('status');
/** Reads the turn state without waiting: a page between screens simply has none. */
export const statusState = (page: Page) =>
    page.evaluate(() => document.querySelector('[role="status"]')?.getAttribute('data-state') ?? '');
export const result = (page: Page) => page.getByTestId('result');
export const handButtons = (page: Page) => page.locator('.hand button');
const gone = (page: Page) => page.getByTestId('duel-gone');
const pairButtons = (page: Page) => page.locator('.pairs button');
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
export async function fingerprint(page: Page): Promise<string> {
    if (await result(page).isVisible()) {
        return 'over';
    }
    const pairs = await pairButtons(page).evaluateAll((nodes) =>
        nodes.map((node) => `${node.getAttribute('data-attack')}/${node.getAttribute('data-defence') ?? ''}`),
    );
    return `${await statusState(page)}|${(await attrs(handButtons(page), 'data-card')).join(',')}|${pairs.join(',')}`;
}

export type Move = 'ATTACK' | 'DEFEND' | 'TAKE' | 'END_ATTACK';

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

export interface PlayOptions {
    /** Take the first attack instead of beating it, so every move type occurs at least once in a game. */
    forceTake?: boolean;
    maxMoves?: number;
    /** Waiting for the other side's view to catch up is not a move, so the loop is bounded by time too. */
    deadlineMs?: number;
}

/**
 * Plays a duel already on both screens to a result with a greedy strategy: attack with the lowest card, throw in
 * whatever is playable, beat with the cheapest card that beats, take otherwise. Returns how often each move was
 * made; the caller asserts on the result screens.
 */
export async function playToResult(
    players: readonly [Page, Page],
    { forceTake = false, maxMoves = 600, deadlineMs = 3 * 60_000 }: PlayOptions = {},
): Promise<Record<Move, number>> {
    const played: Record<Move, number> = { ATTACK: 0, DEFEND: 0, TAKE: 0, END_ATTACK: 0 };
    let tookOnce = !forceTake;

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
            if (!tookOnce) {
                tookOnce = true;
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

    const deadline = Date.now() + deadlineMs;
    let moves = 0;
    while (moves < maxMoves && Date.now() < deadline) {
        if ((await result(players[0]).isVisible()) && (await result(players[1]).isVisible())) {
            break;
        }
        let acted = false;
        for (const page of players) {
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
            await players[0].waitForTimeout(150);
        }
    }
    await expect(result(players[0])).toBeVisible();
    await expect(result(players[1])).toBeVisible();
    return played;
}
