import { submitDevLogin } from './helpers';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * A player equips the `memes-demo` content pack in settings and plays a friendly duel to a result with it. Its faces
 * must come from the pack, and its "inseparable" rule must keep the king and jack of spades side by side whenever
 * both are in the hand. A random deal may never give both, so the check runs at every step of the game rather than
 * once. The opponent keeps the classic deck: a pack only ever changes its owner's screen. Like duel.spec.ts, every
 * decision is read from data-* attributes, never from visible copy.
 */

const RANKS = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'];
const MAX_MOVES = 600;
const PLAY_DEADLINE_MS = 3 * 60_000;
const PACK = 'memes-demo';
const STICKY = ['KING_OF_SPADES', 'JACK_OF_SPADES'] as const;

interface Card {
    rank: number;
    suit: string;
    id: string;
}

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
    await submitDevLogin(page, username);
    return page;
}

const status = (page: Page) => page.getByRole('status');
const statusState = (page: Page) =>
    page.evaluate(() => document.querySelector('[role="status"]')?.getAttribute('data-state') ?? '');
const gone = (page: Page) => page.getByTestId('duel-gone');
const handButtons = (page: Page) => page.locator('.hand button');
const result = (page: Page) => page.getByTestId('result');
const cardOf = (page: Page, id: string) => page.locator(`.hand button[data-card="${id}"]`);
const pairOf = (page: Page, id: string) => page.locator(`.pairs button[data-attack="${id}"]`);

async function attrs(locator: Locator, name: string): Promise<string[]> {
    return (
        await locator.evaluateAll((nodes, attr) => nodes.map((node) => node.getAttribute(attr) ?? ''), name)
    ).filter(Boolean);
}

async function openAttacks(page: Page): Promise<string[]> {
    return page
        .locator('.pairs button:not([data-defence])')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-attack') ?? ''));
}

/** The hand as drawn, in DOM order, with the image each card shows; read in one go so it is one consistent frame. */
async function drawnHand(page: Page): Promise<{ ids: string[]; srcs: string[] }> {
    return page.evaluate(() => {
        const cards = [...document.querySelectorAll('.hand-card')];
        return {
            ids: cards.map((card) => card.getAttribute('data-card') ?? ''),
            srcs: cards.map((card) => card.querySelector('img')?.getAttribute('src') ?? ''),
        };
    });
}

async function fingerprint(page: Page): Promise<string> {
    if (await result(page).isVisible()) {
        return 'over';
    }
    const pairs = await page
        .locator('.pairs button')
        .evaluateAll((nodes) =>
            nodes.map(
                (node) => `${node.getAttribute('data-attack')}/${node.getAttribute('data-defence') ?? ''}`,
            ),
        );
    return `${await statusState(page)}|${(await attrs(handButtons(page), 'data-card')).join(',')}|${pairs.join(',')}`;
}

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

/** One greedy decision for whoever's status says it is their move; false when it is not their move. */
async function act(page: Page): Promise<boolean> {
    const state = await statusState(page);
    const before = await fingerprint(page);
    if (state === 'your-attack') {
        const lowest = (await attrs(handButtons(page), 'data-card'))
            .map(parse)
            .sort((a, b) => a.rank - b.rank)[0];
        await cardOf(page, lowest?.id ?? '').click();
    } else if (state === 'throw-in') {
        const throwIn = page.locator('.hand button[data-playable="true"]').first();
        if (await throwIn.count()) {
            await throwIn.click();
        } else {
            await page.getByTestId('end-attack').click();
        }
    } else if (state === 'defend') {
        const trump = (await page.getByTestId('trump').getAttribute('data-suit')) ?? '';
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
        } else {
            await page.getByTestId('take').click();
        }
    } else {
        return false;
    }
    const outcome = await outcomeOf(page, before);
    expect(outcome, `${state} had no effect`).not.toBe('stuck');
    return outcome === 'moved';
}

test('a duel plays to a result with the demo pack, keeping its sticky pair together', async ({ browser }) => {
    const suffix = `${Date.now() % 1_000_000}`;
    const alice = await signIn(browser, `e2e-p-${suffix}`);

    // Equip the demo pack through the settings screen.
    await alice.getByTestId('nav-profile').click();
    await alice.getByTestId('open-settings').click();
    await expect(alice.getByTestId('deck-picker')).toBeVisible();
    await expect(alice.getByTestId('deck-karykatury')).toHaveAttribute('aria-checked', 'true');
    await alice.getByTestId(`deck-${PACK}`).click();
    await expect(alice.getByTestId(`deck-${PACK}`)).toHaveAttribute('aria-checked', 'true');
    await alice.evaluate(() => {
        window.location.hash = '#/';
    });

    // A friendly invite, accepted by a second player who keeps the default deck («Карикатури»).
    await alice.getByTestId('invite').click();
    await alice.getByTestId('stake-0').click();
    const code = (await alice.getByTestId('invite-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[0-9a-f-]{36}$/);
    const bob = await signIn(browser, `e2e-q-${suffix}`, `/app/?invite=${code}`);
    await expect(status(alice)).toBeVisible();
    await expect(status(bob)).toBeVisible();

    await expect(alice.locator('.hand-card img').first()).toHaveAttribute(
        'src',
        new RegExp(`^/app/packs/${PACK}/`),
    );
    await expect(bob.locator('.hand-card img').first()).toHaveAttribute('src', /^\/app\/packs\/karykatury\//);

    let stepsWithPair = 0;
    /** Alice's hand right now: every face from the pack, and the sticky pair adjacent whenever both are held. */
    const checkAlice = async () => {
        if (await result(alice).isVisible()) {
            return;
        }
        const { ids, srcs } = await drawnHand(alice);
        for (const src of srcs) {
            expect(src, 'a hand card not drawn from the pack').toMatch(new RegExp(`^/app/packs/${PACK}/`));
        }
        const king = ids.indexOf(STICKY[0]);
        const jack = ids.indexOf(STICKY[1]);
        if (king >= 0 && jack >= 0) {
            stepsWithPair++;
            expect(jack, `hand ${ids.join(',')} split the sticky pair`).toBe(king + 1);
        }
    };

    const deadline = Date.now() + PLAY_DEADLINE_MS;
    let moves = 0;
    while (moves < MAX_MOVES && Date.now() < deadline) {
        if ((await result(alice).isVisible()) && (await result(bob).isVisible())) {
            break;
        }
        await checkAlice();
        let acted = false;
        for (const page of [alice, bob]) {
            expect(await gone(page).isVisible(), 'a player lost the duel screen').toBe(false);
            if ((await result(page).isVisible()) || !(await act(page))) {
                continue;
            }
            moves++;
            acted = true;
            break;
        }
        if (!acted) {
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
    test.info().annotations.push({ type: 'sticky-pair-steps', description: String(stepsWithPair) });
});
