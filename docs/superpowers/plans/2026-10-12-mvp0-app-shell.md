# MVP 0: App Shell & Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the PoC's single-screen client into a Ukrainian-language app shell — router, bottom navigation, lobby / friends / shop / profile / settings screens, a small UI kit on design tokens, motion and audio primitives wired into the duel, swipe-to-play, Telegram avatar and BackButton — with a one-tap invite flow, while every existing gate (lint, unit, build, smoke, Playwright E2E, CI) stays green.

**Architecture:** Client-only slice; the backend is untouched. Strings move behind `t(key)` with `uk.json` as the only locale; tests and E2E stop reading visible copy and read `data-*` attributes instead. A hash router and a `Shell` component replace `Home`'s screen switch; the launch logic (active duel → launch invite → own pending invite → lobby) moves into a hook. `src/motion` wraps the Web Animations API, `src/audio` wraps one `AudioContext`; a pure `diffViews(prev, next)` in `src/game/diff.ts` turns consecutive `DuelView`s into table events that drive both today (sounds/animations) and MVP 4's rule engine. Settings live in Preact signals persisted to `localStorage` (per-device convenience only).

**Tech Stack:** Preact 11 + `@preact/signals`, TypeScript strict, Vite 8, Vitest + Testing Library (jsdom), Playwright, Web Animations API, Web Audio API, Telegram Mini App SDK (`window.Telegram.WebApp`).

**Spec:** `docs/superpowers/specs/2026-10-12-mvp-design.md` (§3 client shape, §5 client design, §9 MVP 0 row).

## Global Constraints

- UI copy is Ukrainian; code, comments, commit messages, docs and issue text are English (spec §1).
- Every user-visible string goes through `t(key)`; `src/i18n/uk.json` is the only shipped locale; a test fails on missing or unused keys (spec §5 "i18n").
- Tests and E2E target `data-testid` / `data-*` attributes and keys, never visible copy (spec §2 "Language").
- Client gates: `npm run lint && npm test && npm run build` in `client/`, and `make e2e` + `scripts/smoke.sh` against `make up` before closing (CLAUDE.md).
- Prettier: 4-space indent (`.editorconfig`), single quotes, width 110. ESLint `typescript-eslint` strict.
- Game logic stays on the server; client selectors only enable controls (CLAUDE.md). Motion/audio/layout are cosmetic and never produce a move.
- Motion honours `prefers-reduced-motion` and the settings toggle (spec §5 "Motion"); audio unlocks on first tap and respects settings (spec §5 "Sound").
- Token stays in memory; settings may use `localStorage` (per-device convenience); nothing secret in the client.
- Commit per task, subject ≤ 72 chars imperative, body says why, footer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Last commit of an issue carries `Closes #<n>`.
- Build-time env: `VITE_TELEGRAM_BOT_USERNAME`, `VITE_TELEGRAM_APP_NAME` (nginx/Dockerfile). No new build args in this slice.

## Review Focus

Inputs the spec implies but no existing test covers; each line names the task that pins it with a test.

1. **A Telegram user without a photo or last name** — the avatar must fall back to initials from `first_name` and never render a broken `<img>`. → Task 5 (`Avatar` test "renders initials when no photo").
2. **Returning from a sub-screen with Telegram's BackButton while an invite is pending** — the pending invite must still be resumed, not re-created. → Task 8 (`Shell` test "back from settings keeps the waiting screen").
3. **`localStorage` throws (private mode / Telegram webview with storage blocked)** — settings must load defaults and the app must not crash. → Task 4 (`settings` test "survives a throwing storage").
4. **Swipe shorter than the threshold, or a horizontal scroll of the hand** — must not play a card. → Task 10 (`Table` swipe tests "short drag is a no-op", "horizontal drag is a no-op").
5. **Audio before the first user gesture (autoplay policy) and `AudioContext` missing (old webview)** — `play()` must be a silent no-op, not an exception, and must start working after the first tap. → Task 7 (`audio` tests "no-op before unlock", "no AudioContext available").

---

## File structure

```
client/
  package.json                          + @preact/signals
  src/
    i18n/uk.json                        all copy, nested keys
    i18n/index.ts                       t(key, params), cardLabel(card), plural helper
    i18n/i18n.test.ts                   completeness: used ⊆ defined, defined ⊆ used
    router/index.ts                     Route type, parseRoute, navigate, useRoute
    router/router.test.ts
    state/settings.ts                   Settings signal + persistence
    state/settings.test.ts
    telegram/webapp.ts                  + user, backButton
    telegram/webapp.test.ts             (extend)
    motion/index.ts                     primitives + motionEnabled()
    motion/motion.test.ts
    audio/index.ts                      AudioManager
    audio/audio.test.ts
    game/diff.ts                        diffViews(prev, next) → TableEvent[]
    game/diff.test.ts
    ui/kit/tokens.css                   design tokens (replaces :root block in styles.css)
    ui/kit/Button.tsx, Sheet.tsx, Toast.tsx, Badge.tsx, Avatar.tsx, Tabs.tsx, ListRow.tsx, BottomNav.tsx
    ui/kit/kit.test.tsx
    ui/Shell.tsx                        router + nav + launch hook (replaces Home.tsx)
    ui/Shell.test.tsx                   (replaces Home.test.tsx)
    ui/useLaunch.ts                     active duel → launch invite → pending invite → lobby
    ui/lobby/Lobby.tsx, Waiting.tsx, JoinByCode.tsx
    ui/lobby/lobby.test.tsx
    ui/friends/Friends.tsx
    ui/shop/Shop.tsx
    ui/profile/Profile.tsx, profile.test.tsx
    ui/settings/Settings.tsx, settings.test.tsx
    ui/DuelScreen.tsx                   i18n, avatars, diff → motion/audio, result overlay
    ui/Table.tsx                        data-* attributes, swipe, avatars
    ui/App.tsx, DevLogin.tsx            i18n, testids
    ui/styles.css                       restyled on tokens
    main.tsx                            wires Shell, settings, audio, motion
  public/sounds/default/*.wav           generated placeholders
  scripts/gen-sounds.mjs                generator (npm run gen:sounds)
  e2e/duel.spec.ts                      data-* selectors; + shell.spec.ts
```

---

### Task 0: Milestone and issues

**Files:** none (GitHub only).

- [ ] **Step 1: Create the milestone and one issue per task**

```bash
cd /home/vampir/petProjects/cardwar
gh api repos/javaAndScriptDeveloper/cardwar/milestones -f title="MVP 0: App shell & design system" \
  -f description="Spec: docs/superpowers/specs/2026-10-12-mvp-design.md. Plan: docs/superpowers/plans/2026-10-12-mvp0-app-shell.md"
M="MVP 0: App shell & design system"
mk() { gh issue create --milestone "$M" --title "$1" --body "$2" ; }
mk "Decouple tests and E2E from visible copy" "Plan task 1. Add data-* attributes to the table, lobby, result and dev login; rewrite e2e/duel.spec.ts to use them. Copy stays English in this task. Depends on: none."
mk "Ukrainian message catalog and t()" "Plan task 2. src/i18n with uk.json, t(key, params), cardLabel; completeness test; migrate every string. Depends on: #<task1>."
mk "Hash router and Telegram BackButton" "Plan task 3. src/router, Telegram wrapper gains backButton and user. Depends on: none."
mk "Settings store on Preact signals" "Plan task 4. @preact/signals; settings persisted in localStorage with a throwing-storage fallback. Depends on: none."
mk "UI kit on design tokens" "Plan task 5. tokens.css; Button, Sheet, Toast, Badge, Avatar (initials fallback), Tabs, ListRow, BottomNav. Depends on: #<task2>."
mk "Motion primitives" "Plan task 6. src/motion on the Web Animations API; reduced-motion and settings honoured. Depends on: #<task4>."
mk "Audio manager and placeholder sounds" "Plan task 7. src/audio; gen-sounds script; no-op before unlock. Depends on: #<task4>."
mk "Shell, lobby, waiting, friends, shop, profile, settings screens" "Plan task 8. Shell replaces Home; useLaunch hook; one-tap invite; screens in Ukrainian. Depends on: #<task3> #<task5>."
mk "View diff to table events" "Plan task 9. src/game/diff.ts: pure diffViews(prev, next). Depends on: none."
mk "Duel screen: swipe, avatars, motion, sound" "Plan task 10. Table swipe-to-play, both avatars, diff-driven animations and sounds, result overlay. Depends on: #<task6> #<task7> #<task9> #<task8>."
mk "E2E for the shell and docs" "Plan task 11. e2e/shell.spec.ts, README client section, CLAUDE.md client conventions, deploy. Depends on: all."
```

Replace `#<taskN>` with the numbers `gh` prints. Comment "Starting. Plan: …" on each issue when you begin it, as `CLAUDE.md` requires.

---

### Task 1: Decouple tests and E2E from visible copy

**Files:**
- Modify: `client/src/ui/Table.tsx`
- Modify: `client/src/ui/DuelScreen.tsx` (result section, toast)
- Modify: `client/src/ui/Home.tsx` (buttons, inputs)
- Modify: `client/src/ui/DevLogin.tsx`
- Modify: `client/src/game/selectors.ts` (export `statusState`)
- Modify: `client/src/game/selectors.test.ts`
- Modify: `client/e2e/duel.spec.ts`
- Test: `client/src/ui/Table.test.tsx` (extend)

**Interfaces:**
- Produces: `cardId(card: Card): string` in `src/game/cards.ts` → `"SEVEN_OF_SPADES"`; `statusState(view): StatusState` in `src/game/selectors.ts` where `type StatusState = 'your-attack' | 'throw-in' | 'defending' | 'defend' | 'waiting-attack' | 'waiting' | 'over'`.
- DOM contract (used by every later task and by E2E):
  - `[role=status][data-state=<StatusState>]`
  - hand cards: `button.hand-card[data-card=<cardId>][data-playable=true|false]`
  - table pairs: `button.pair[data-attack=<cardId>][data-defence=<cardId>?]`
  - trump: `[data-testid=trump][data-card=<cardId>]`
  - `[data-testid=take]`, `[data-testid=end-attack]`, `[data-testid=invite]`, `[data-testid=share-invite]`, `[data-testid=copy-code]`, `[data-testid=invite-code]`, `[data-testid=join-code]` (input), `[data-testid=join]`, `[data-testid=back-to-lobby]`
  - result: `[data-testid=result][data-result=WON|LOST|DRAW]`
  - toast: `[role=alert][data-reason=<engine reason or 'network'|'throttled'|'generic'>]`
  - dev login: `[data-testid=dev-username]`, `[data-testid=dev-password]`, `[data-testid=dev-sign-in]`

- [ ] **Step 1: Failing unit tests for `cardId` and `statusState`**

Append to `client/src/game/selectors.test.ts`:

```ts
import { cardId } from './cards';
import { statusState } from './selectors';
import { attackerFresh, defenderWithOpenAttack } from './fixtures/views'; // pick two existing fixtures

describe('statusState', () => {
    it('names the attacker\'s fresh turn', () => {
        expect(statusState(attackerFresh)).toBe('your-attack');
    });
    it('names the defender\'s open attack', () => {
        expect(statusState(defenderWithOpenAttack)).toBe('defend');
    });
});

describe('cardId', () => {
    it('is RANK_OF_SUIT', () => {
        expect(cardId({ rank: 'SEVEN', suit: 'SPADES' })).toBe('SEVEN_OF_SPADES');
    });
});
```

Open `client/src/game/fixtures/views.ts` first and use the real fixture names it exports (one where the caller is attacker with an empty table, one where the caller defends an open attack).

- [ ] **Step 2: Run, expect failure**

Run: `cd client && npx vitest run src/game/selectors.test.ts`
Expected: FAIL — `cardId` / `statusState` not exported.

- [ ] **Step 3: Implement**

`src/game/cards.ts`, append:

```ts
/** Stable machine id, used in data-* attributes so tests never depend on display names. */
export function cardId(card: Card): string {
    return `${card.rank}_OF_${card.suit}`;
}
```

`src/game/selectors.ts`: add the type and function next to `status`, and make `status` derive from it:

```ts
export type StatusState =
    | 'your-attack'
    | 'throw-in'
    | 'defending'
    | 'defend'
    | 'waiting-attack'
    | 'waiting'
    | 'over';

/** The machine-readable turn state; `status` turns it into a sentence. */
export function statusState(view: DuelView): StatusState {
    if (!live(view)) {
        return 'over';
    }
    const undefended = undefendedAttacks(view).length;
    if (role(view) === 'attacker') {
        if (view.table.length === 0) {
            return 'your-attack';
        }
        return undefended > 0 ? 'defending' : 'throw-in';
    }
    if (view.table.length === 0) {
        return 'waiting-attack';
    }
    return undefended > 0 ? 'defend' : 'waiting';
}

export function status(view: DuelView, opponentName: string): string {
    switch (statusState(view)) {
        case 'over':
            return 'Duel over';
        case 'your-attack':
            return 'Your attack';
        case 'defending':
            return `${opponentName} is defending`;
        case 'throw-in':
            return 'Throw in or end the attack';
        case 'waiting-attack':
            return `Waiting for ${opponentName} to attack`;
        case 'defend':
            return 'Defend';
        case 'waiting':
            return `Waiting for ${opponentName}`;
    }
}
```

- [ ] **Step 4: Add the data attributes**

`src/ui/Table.tsx`:
- status: `<p class="status" role="status" data-state={statusState(view)}>`
- trump: `<CardImage card={view.trumpCard} class="card small trump" data-testid="trump" data-card={cardId(view.trumpCard)} />` — extend `CardImage` props with `'data-testid'?: string; 'data-card'?: string` and spread them onto the `<img>`.
- pairs: `data-attack={cardId(pair.attack)} data-defence={pair.defence ? cardId(pair.defence) : undefined}`
- hand: `data-card={cardId(card)}` beside the existing `data-playable`.
- buttons: `data-testid="take"`, `data-testid="end-attack"`.

`src/ui/DuelScreen.tsx`:
- result: `<section class={…} data-testid="result" data-result={state.result.result}>`; back button `data-testid="back-to-lobby"`.
- toast: keep `role="alert"`, add `data-reason`. Track it in state: `const [toast, setToast] = useState<{ text: string; reason: string }>()`; `say(text, reason)` with reasons `'network'`, `'throttled'` (status 429), the engine `error.reason`, or `'generic'`; `'pick-target'` for "Tap the card you want to beat first."

`src/ui/Home.tsx`: `data-testid="invite"` on "Invite a friend", `data-testid="join-code"` on the input, `data-testid="join"` on Join, `data-testid="share-invite"`, `data-testid="copy-code"`. Keep `data-testid="invite-code"`.

`src/ui/DevLogin.tsx`: `data-testid="dev-username"`, `data-testid="dev-password"`, `data-testid="dev-sign-in"`.

- [ ] **Step 5: Extend `Table.test.tsx`**

```tsx
it('exposes machine-readable state for tests', () => {
    render(<Table view={defenderWithOpenAttack} opponentName="Bob" {...noop} />);
    expect(screen.getByRole('status').getAttribute('data-state')).toBe('defend');
    expect(document.querySelector('.pair')?.getAttribute('data-attack')).toMatch(/^[A-Z]+_OF_[A-Z]+$/);
    expect(screen.getByTestId('trump').getAttribute('data-card')).toMatch(/^[A-Z]+_OF_[A-Z]+$/);
    expect(document.querySelector('.hand-card')?.getAttribute('data-card')).toMatch(/^[A-Z]+_OF_[A-Z]+$/);
});
```

(`noop` = the four handlers as `vi.fn()`; reuse what the file already defines.)

- [ ] **Step 6: Rewrite the E2E selectors**

In `client/e2e/duel.spec.ts`:

```ts
const RANKS = ['SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE'];

interface Card { rank: number; suit: string; id: string }

/** "SEVEN_OF_SPADES" -> a comparable card. */
function parse(id: string): Card {
    const [rank = '', , suit = ''] = id.split('_');
    return { rank: RANKS.indexOf(rank), suit, id };
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
const statusState = async (page: Page) => (await status(page).getAttribute('data-state').catch(() => null)) ?? '';
const handButtons = (page: Page) => page.locator('.hand button');
const result = (page: Page) => page.getByTestId('result');

async function ids(locator: Locator, attr: string): Promise<string[]> {
    return (await locator.evaluateAll((nodes, a) => nodes.map((n) => n.getAttribute(a) ?? ''), attr)).filter(Boolean);
}
const cardOf = (page: Page, id: string) => page.locator(`.hand button[data-card="${id}"]`);
const pairOf = (page: Page, id: string) => page.locator(`.pairs button[data-attack="${id}"]`);
```

`fingerprint` concatenates `data-state`, hand `data-card`s and pair `data-attack`/`data-defence`s. `outcomeOf` checks `alert.getAttribute('data-reason')` ∈ `network|throttled`. The illegal-tap assertion becomes `await expect(defender.getByRole('alert')).toHaveAttribute('data-reason', 'NOT_YOUR_TURN')`. In `act`, branch on `statusState` values `your-attack`, `throw-in`, `defend`; open pairs are those **without** `data-defence`; the trump suit comes from `page.getByTestId('trump').getAttribute('data-card')`. Result assertion: `data-result` pairs `['DRAW','DRAW']` or `['LOST','WON']`. Lobby: `getByTestId('invite')`, `getByTestId('invite-code')`, `getByTestId('back-to-lobby')`. Replace every `getByRole('button', { name: … })` with the testids above.

- [ ] **Step 7: Gates**

Run: `cd client && npm run lint && npm test && npm run build`
Expected: all pass.
Then from the repo root: `make up` (or the `cardwar-e2e` project with `/tmp/claude-1000/local.env`, see CLAUDE.md gotchas), `make e2e`, `scripts/smoke.sh`. Expected: E2E 1 passed, smoke passed.

- [ ] **Step 8: Commit**

```bash
git add client && git commit -m "Give tests a stable DOM contract instead of visible copy

The UI is about to switch to Ukrainian. Tests and the Playwright run
read status, cards, buttons and results from data-* attributes now, so
changing a sentence never breaks a test again.

Closes #<task1>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 2: Ukrainian message catalog and `t()`

**Files:**
- Create: `client/src/i18n/uk.json`, `client/src/i18n/index.ts`, `client/src/i18n/i18n.test.ts`
- Modify: every file under `client/src/ui/**` and `client/src/game/reasons.ts`, `client/src/game/selectors.ts` (`status`), `client/src/game/cards.ts` (`cardName` stays for image alt? → replaced by `cardLabel`), `client/index.html` (`lang="uk"`).
- Modify: `client/tsconfig.json` → add `"resolveJsonModule": true`.

**Interfaces:**
- Produces: `t(key: string, params?: Record<string, string | number>): string` — looks up a dotted key in `uk.json`, substitutes `{name}` placeholders, returns the key itself when missing (and logs once in dev). `cardLabel(card: Card): string` → e.g. `"Сімка пік"`. `plural(n: number, forms: [one, few, many]): string` for Ukrainian plural rules. `MESSAGE_KEYS` not exported; the test scans source.
- Consumes: `cardId` from Task 1.

- [ ] **Step 1: Failing tests**

`client/src/i18n/i18n.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardLabel, plural, t } from './index';
import uk from './uk.json';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
}

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
}

describe('message catalog', () => {
    const defined = new Set(flatten(uk as Record<string, unknown>));
    const used = new Set<string>();
    for (const file of sources(join(__dirname, '..'))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) used.add(m[1] ?? '');
    }
    // Keys built at runtime from a code (reasons, status states) are declared here so the scan can see them.
    const dynamic = [
        ...['your-attack', 'throw-in', 'defending', 'defend', 'waiting-attack', 'waiting', 'over'].map((s) => `duel.status.${s}`),
        ...Object.keys((uk as { reason: Record<string, string> }).reason).map((r) => `reason.${r}`),
        ...['WON', 'LOST', 'DRAW'].map((r) => `duel.result.${r}`),
    ];
    dynamic.forEach((k) => used.add(k));

    it('defines every key the code uses', () => {
        expect([...used].filter((k) => !defined.has(k))).toEqual([]);
    });
    it('uses every key it defines', () => {
        expect([...defined].filter((k) => !used.has(k) && !k.startsWith('card.'))).toEqual([]);
    });
});

describe('t', () => {
    it('substitutes params', () => {
        expect(t('duel.status.defending', { name: 'Оля' })).toContain('Оля');
    });
    it('returns the key when missing', () => {
        expect(t('nope.missing')).toBe('nope.missing');
    });
});

describe('cardLabel', () => {
    it('reads Ukrainian', () => {
        expect(cardLabel({ rank: 'SEVEN', suit: 'SPADES' })).toBe('Сімка пік');
    });
});

describe('plural', () => {
    it('follows Ukrainian rules', () => {
        expect(plural(1, ['карта', 'карти', 'карт'])).toBe('карта');
        expect(plural(3, ['карта', 'карти', 'карт'])).toBe('карти');
        expect(plural(5, ['карта', 'карти', 'карт'])).toBe('карт');
        expect(plural(21, ['карта', 'карти', 'карт'])).toBe('карта');
        expect(plural(12, ['карта', 'карти', 'карт'])).toBe('карт');
    });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/i18n` — FAIL (module missing).

- [ ] **Step 3: Implement `index.ts`**

```ts
import type { Card, Rank, Suit } from '../game/cards';
import uk from './uk.json';

type Tree = { [key: string]: string | Tree };
const catalog: Tree = uk as Tree;
const warned = new Set<string>();

function lookup(key: string): string | undefined {
    let node: string | Tree | undefined = catalog;
    for (const part of key.split('.')) {
        if (typeof node !== 'object' || node === null) return undefined;
        node = node[part];
    }
    return typeof node === 'string' ? node : undefined;
}

/** The one way copy reaches the screen. Missing keys render as the key so they are visible, not silent. */
export function t(key: string, params: Record<string, string | number> = {}): string {
    const text = lookup(key);
    if (text === undefined) {
        if (import.meta.env.DEV && !warned.has(key)) {
            warned.add(key);
            console.warn(`i18n: missing key ${key}`);
        }
        return key;
    }
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Ukrainian plural: 1 карта, 2–4 карти, 5+ карт, with the teens exception. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

const RANK_KEY: Record<Rank, string> = {
    SIX: 'six', SEVEN: 'seven', EIGHT: 'eight', NINE: 'nine', TEN: 'ten',
    JACK: 'jack', QUEEN: 'queen', KING: 'king', ACE: 'ace',
};
const SUIT_KEY: Record<Suit, string> = { CLUBS: 'clubs', DIAMONDS: 'diamonds', HEARTS: 'hearts', SPADES: 'spades' };

/** "Сімка пік" — rank as a noun, suit in the genitive. */
export function cardLabel(card: Card): string {
    return `${t(`card.rank.${RANK_KEY[card.rank]}`)} ${t(`card.suit.${SUIT_KEY[card.suit]}`)}`;
}
```

- [ ] **Step 4: Write `uk.json`**

Create with these keys (the full set the migrated UI needs; add more only with a matching `t()` call):

```json
{
  "app": { "title": "Cardwar", "signingIn": "Входимо…", "signInFailed": "Не вдалося увійти через Telegram: {error}. Закрийте застосунок і відкрийте його знову з бота.", "loading": "Завантаження…" },
  "nav": { "play": "Грати", "friends": "Друзі", "shop": "Магазин", "profile": "Профіль" },
  "lobby": {
    "greeting": "Привіт, {name}!",
    "tagline": "Дурак на двох. 36 карт, підкидний, без переводу.",
    "invite": "Запросити друга",
    "quickMatch": "Швидка гра",
    "soon": "Скоро",
    "joinTitle": "Приєднатися за кодом",
    "joinPlaceholder": "Встав код від друга",
    "join": "Приєднатися",
    "howTo1": "Натисни «Запросити друга» і надішли запрошення: посиланням або кодом.",
    "howTo2": "Друг тисне посилання або вставляє код у «Приєднатися за кодом».",
    "howTo3": "Дуель починається для обох, щойно друг приєднається.",
    "errors": {
      "loadDuels": "Не вдалося завантажити дуелі: {error}.",
      "createInvite": "Не вдалося створити запрошення: {error}.",
      "inviteExpired": "Це запрошення прострочене або не існує.",
      "ownInvite": "Це твоє власне запрошення. Надішли його другові.",
      "inviteTaken": "Хтось уже прийняв це запрошення.",
      "join": "Не вдалося приєднатися: {error}.",
      "waitExpired": "Запрошення прострочилося, ніхто не приєднався."
    }
  },
  "waiting": {
    "title": "Чекаємо на друга",
    "hint": "Надішли запрошення. Дуель почнеться, щойно друг його відкриє.",
    "share": "Поділитися в Telegram",
    "shareText": "Зіграємо в Дурака в Cardwar!",
    "codeHint": "Або дай другові цей код:",
    "copy": "Скопіювати код",
    "copied": "Скопійовано",
    "copyBlocked": "Копіювання тут заблоковане: затисни код пальцем.",
    "trouble": "Проблеми зі зв’язком: {error}. Пробуємо далі.",
    "cancel": "Скасувати"
  },
  "friends": { "title": "Друзі", "empty": "Тут з’являться всі, з ким ти грав. Поки нікого — запроси друга!", "invite": "Запросити друга" },
  "shop": { "title": "Магазин", "tabs": { "decks": "Колоди", "backs": "Сорочки", "tables": "Столи", "frames": "Рамки", "emotes": "Емодзі" }, "soon": "Магазин відкриється скоро. Перші колоди вже в дорозі." },
  "profile": { "title": "Профіль", "history": "Останні дуелі", "noHistory": "Ще жодної дуелі. Час це виправити.", "settings": "Налаштування", "vs": "проти {name}", "moves": "{n} {moves}", "movesForms": ["хід", "ходи", "ходів"] },
  "settings": { "title": "Налаштування", "sound": "Звуки", "music": "Музика", "haptics": "Вібрація", "swipe": "Свайп, щоб походити", "reducedMotion": "Менше анімацій", "back": "Назад" },
  "duel": {
    "loading": "Завантажуємо дуель…",
    "gone": "Ця дуель уже недоступна. Можливо, вона прострочилася.",
    "loadResult": "Не вдалося завантажити результат: {error}.",
    "opponent": "Суперник",
    "trump": "Козир",
    "discarded": "Відбій: {n}",
    "take": "Беру",
    "endAttack": "Бито",
    "pickTarget": "Спочатку торкнись карти, яку хочеш побити.",
    "connectionLost": "Зв’язок обірвався. Перевір стіл і спробуй ще раз.",
    "back": "До початку",
    "status": {
      "your-attack": "Твій хід — атакуй",
      "throw-in": "Підкинь або скажи «Бито»",
      "defending": "{name} відбивається",
      "defend": "Відбивайся",
      "waiting-attack": "Чекаємо, поки {name} походить",
      "waiting": "Чекаємо на {name}",
      "over": "Дуель завершено"
    },
    "result": { "WON": "Перемога!", "LOST": "Поразка", "DRAW": "Нічия" },
    "explain": { "WON": "Ти скинув усі карти першим.", "LOST": "{name} скинув усі карти першим. Цього разу дурак — ти.", "DRAW": "Ви обидва скинули карти в одному раунді." }
  },
  "error": { "noConnection": "немає з’єднання", "throttled": "забагато запитів, трохи повільніше", "generic": "щось пішло не так", "http": "помилка {status}" },
  "reason": {
    "NOT_A_PARTICIPANT": "Ти не граєш у цій дуелі.",
    "DUEL_FINISHED": "Дуель уже завершена.",
    "NOT_YOUR_TURN": "Зараз не твій хід.",
    "CARD_NOT_IN_HAND": "Цієї карти вже немає в тебе на руках.",
    "TABLE_EMPTY": "На столі нічого немає.",
    "ATTACK_LIMIT_REACHED": "За раунд — не більше шести атак.",
    "DEFENDER_HAND_TOO_SMALL": "У суперника не лишилося карт на ще одну атаку.",
    "RANK_NOT_ON_TABLE": "Підкидати можна лише те, що вже є на столі.",
    "TARGET_NOT_ON_TABLE": "Цієї карти немає на столі.",
    "TARGET_ALREADY_DEFENDED": "Цю карту вже побили.",
    "CANNOT_BEAT": "Ця карта її не б’є.",
    "UNDEFENDED_CARDS_REMAIN": "Спочатку побий усі карти на столі.",
    "NOTHING_TO_TAKE": "Нічого брати."
  },
  "card": {
    "back": "Сорочка карти",
    "rank": { "six": "Шістка", "seven": "Сімка", "eight": "Вісімка", "nine": "Дев’ятка", "ten": "Десятка", "jack": "Валет", "queen": "Дама", "king": "Король", "ace": "Туз" },
    "suit": { "clubs": "треф", "diamonds": "бубен", "hearts": "чирв", "spades": "пік" }
  },
  "dev": { "notice": "Поза Telegram: dev-режим. Увійди під будь-яким ім’ям; нові імена реєструються.", "username": "Ім’я", "password": "Пароль", "signIn": "Увійти" }
}
```

`profile.movesForms` is an array: `plural(n, uk.profile.movesForms as [string,string,string])` — exempt arrays from the "defined ⊆ used" check by skipping non-string leaves in `flatten` (adjust the helper: only push string leaves).

- [ ] **Step 5: Migrate every string**

- `src/ui/errors.ts`: `describeError` → `t('error.noConnection')`, `t('error.throttled')`, `t('error.http', {status})`, `t('error.generic')`; keep `error.reason ?? error.detail` as the last resort for ApiError (backend English detail is acceptable for unexpected cases).
- `src/game/reasons.ts`: `reasonMessage(reason)` → `reason && lookup exists ? t(`reason.${reason}`) : undefined`. Implement "exists" by comparing `t()`'s result to the key.
- `src/game/selectors.ts` `status()` → `t(`duel.status.${statusState(view)}`, { name: opponentName })`.
- `src/ui/CardImage.tsx`: `alt={cardLabel(card)}`, back `alt={t('card.back')}`; keep `cardName` only for `key=` usage (or switch keys to `cardId`). Remove `cardName` if nothing else uses it.
- `src/ui/Table.tsx`: aria-labels via `cardLabel`; pair label `t` is unnecessary — set `aria-label` to `${cardLabel(attack)}` plus `, побита ${cardLabel(defence)}` with a key `duel.beatenBy` = `"{attack}, побита {defence}"` (add to `uk.json`). Buttons `t('duel.take')`, `t('duel.endAttack')`, trump `t('duel.trump')`, discard `t('duel.discarded', {n})`.
- `src/ui/DuelScreen.tsx`: loading, gone, result headings `t(`duel.result.${r}`)`, explain `t(`duel.explain.${r}`, {name})`, toasts, back button; default opponent name `t('duel.opponent')`.
- `src/ui/Home.tsx`, `App.tsx`, `DevLogin.tsx`: all strings. `Home` gets deleted in Task 8; migrate it anyway so the suite is green between tasks.
- Delete the English unit assertions that broke; rewrite them against keys: e.g. `expect(screen.getByRole('alert').textContent).toBe(t('lobby.errors.inviteExpired'))`.
- `index.html`: `<html lang="uk">`, `<title>Cardwar</title>` stays.

- [ ] **Step 6: Gates**

Run: `npm run lint && npm test && npm run build` — pass (fix Prettier with `npm run format` if needed). E2E still passes because Task 1 removed every copy dependency: `make e2e` from the root against the running stack. Then `scripts/smoke.sh` (step 1b looks for `<div id="app">`, unaffected).

- [ ] **Step 7: Commit**

```bash
git add client && git commit -m "Move all client copy into a Ukrainian message catalog

Players are Ukrainian; the PoC was English. Every string now goes
through t(key) with uk.json as the only locale, so adding a language
later is one file and a test keeps keys and usages in sync.

Closes #<task2>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 3: Hash router and Telegram BackButton / user

**Files:**
- Create: `client/src/router/index.ts`, `client/src/router/router.test.ts`
- Modify: `client/src/telegram/webapp.ts`, `client/src/telegram/webapp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Route =
      | { name: 'lobby' } | { name: 'friends' } | { name: 'shop' } | { name: 'profile' }
      | { name: 'settings' } | { name: 'duel'; duelId: string };
  export function parseRoute(hash: string): Route;            // '' | '#/' → lobby; '#/duel/abc' → duel
  export function routeHash(route: Route): string;            // inverse
  export function navigate(route: Route): void;               // sets location.hash
  export function useRoute(): Route;                          // hook, re-renders on hashchange
  export const TOP_LEVEL: ReadonlySet<Route['name']>;         // lobby, friends, shop, profile
  ```
- Telegram wrapper gains:
  ```ts
  interface TelegramUser { id: number; firstName: string; lastName?: string; username?: string; photoUrl?: string }
  readonly user: TelegramUser | undefined;
  backButton(visible: boolean, onClick?: () => void): void;   // no-op outside Telegram
  readonly colorScheme: 'light' | 'dark';
  ```

- [ ] **Step 1: Failing tests**

`src/router/router.test.ts`:

```ts
import { act, renderHook } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { navigate, parseRoute, routeHash, useRoute } from './index';

describe('parseRoute', () => {
    it.each([
        ['', { name: 'lobby' }],
        ['#/', { name: 'lobby' }],
        ['#/friends', { name: 'friends' }],
        ['#/settings', { name: 'settings' }],
        ['#/duel/abc-1', { name: 'duel', duelId: 'abc-1' }],
        ['#/garbage/x', { name: 'lobby' }],
    ])('%s', (hash, route) => {
        expect(parseRoute(hash)).toEqual(route);
    });
    it('round-trips', () => {
        expect(parseRoute(routeHash({ name: 'duel', duelId: 'd' }))).toEqual({ name: 'duel', duelId: 'd' });
    });
});

describe('useRoute', () => {
    it('follows navigate()', async () => {
        const { result } = renderHook(() => useRoute());
        await act(() => navigate({ name: 'shop' }));
        expect(result.current).toEqual({ name: 'shop' });
    });
});
```

Extend `src/telegram/webapp.test.ts`:

```ts
it('exposes the user and drives the BackButton inside Telegram', () => {
    const show = vi.fn(), hide = vi.fn(), onClick = vi.fn(), offClick = vi.fn();
    const tg = resolveTelegram({
        Telegram: { WebApp: {
            ...fakeWebApp, initData: 'x=1',
            initDataUnsafe: { user: { id: 7, first_name: 'Оля', photo_url: 'https://p/x.jpg' } },
            colorScheme: 'dark',
            BackButton: { show, hide, onClick, offClick },
        } },
    });
    expect(tg.user).toEqual({ id: 7, firstName: 'Оля', lastName: undefined, username: undefined, photoUrl: 'https://p/x.jpg' });
    expect(tg.colorScheme).toBe('dark');
    const handler = vi.fn();
    tg.backButton(true, handler);
    expect(show).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledWith(handler);
    tg.backButton(false);
    expect(hide).toHaveBeenCalled();
    expect(offClick).toHaveBeenCalledWith(handler);
});

it('has no user and a no-op BackButton outside Telegram', () => {
    const tg = resolveTelegram({});
    expect(tg.user).toBeUndefined();
    expect(() => tg.backButton(true, () => {})).not.toThrow();
});
```

(`fakeWebApp` = the minimal fake the file already builds; add `initDataUnsafe`, `colorScheme`, `BackButton` to `TelegramWebApp`.)

- [ ] **Step 2: Run, expect failure** — `npx vitest run src/router src/telegram`.

- [ ] **Step 3: Implement the router**

```ts
import { useEffect, useState } from 'preact/hooks';

export type Route =
    | { name: 'lobby' } | { name: 'friends' } | { name: 'shop' } | { name: 'profile' }
    | { name: 'settings' } | { name: 'duel'; duelId: string };

export const TOP_LEVEL: ReadonlySet<Route['name']> = new Set(['lobby', 'friends', 'shop', 'profile']);

/** Unknown hashes land on the lobby: a stale deep link must never show a blank screen. */
export function parseRoute(hash: string): Route {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    switch (parts[0]) {
        case undefined: return { name: 'lobby' };
        case 'friends': case 'shop': case 'profile': case 'settings': return { name: parts[0] };
        case 'duel': return parts[1] ? { name: 'duel', duelId: decodeURIComponent(parts[1]) } : { name: 'lobby' };
        default: return { name: 'lobby' };
    }
}

export function routeHash(route: Route): string {
    return route.name === 'lobby' ? '#/' : route.name === 'duel' ? `#/duel/${encodeURIComponent(route.duelId)}` : `#/${route.name}`;
}

export function navigate(route: Route): void {
    const hash = routeHash(route);
    if (window.location.hash !== hash) {
        window.location.hash = hash;
    }
}

export function useRoute(): Route {
    const [route, setRoute] = useState(() => parseRoute(window.location.hash));
    useEffect(() => {
        const onChange = () => setRoute(parseRoute(window.location.hash));
        window.addEventListener('hashchange', onChange);
        return () => window.removeEventListener('hashchange', onChange);
    }, []);
    return route;
}
```

- [ ] **Step 4: Extend the Telegram wrapper**

In `webapp.ts`: add to `TelegramWebApp`: `initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string } }`, `colorScheme: 'light' | 'dark'`, `BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }`. In the in-Telegram branch, map `user`, `colorScheme`, and implement `backButton` remembering the last handler so `false` can `offClick` it. Outside Telegram: `user: undefined`, `colorScheme` from `matchMedia('(prefers-color-scheme: dark)')` when available else `'light'`, `backButton() {}`.

- [ ] **Step 5: Gates and commit**

`npm run lint && npm test && npm run build`.

```bash
git add client && git commit -m "Add a hash router and the Telegram BackButton and user

The shell needs more than one screen. A hash router keeps the SPA
fallback in nginx untouched, and Telegram's own BackButton makes
navigating back feel native inside the Mini App.

Closes #<task3>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 4: Settings store on Preact signals

**Files:**
- Modify: `client/package.json` (`npm i @preact/signals@^2`)
- Create: `client/src/state/settings.ts`, `client/src/state/settings.test.ts`

**Interfaces:**
```ts
export interface Settings { sound: boolean; music: boolean; haptics: boolean; swipe: boolean; reducedMotion: boolean }
export const DEFAULT_SETTINGS: Settings;  // all true except music=false, reducedMotion=false
export const settings: Signal<Settings>;   // import { settings } and read settings.value
export function updateSettings(patch: Partial<Settings>): void;
export function loadSettings(storage?: Pick<Storage, 'getItem' | 'setItem'>): void; // called once in main.tsx
```
Storage key `cardwar.settings.v1`.

- [ ] **Step 1: Failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, settings, updateSettings } from './settings';

describe('settings', () => {
    beforeEach(() => settings.value = DEFAULT_SETTINGS);

    it('persists a change', () => {
        const store = new Map<string, string>();
        const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
        loadSettings(storage);
        updateSettings({ sound: false });
        expect(JSON.parse(store.get('cardwar.settings.v1') ?? '{}')).toMatchObject({ sound: false });
    });

    it('loads what was persisted and ignores unknown keys', () => {
        const storage = { getItem: () => JSON.stringify({ haptics: false, bogus: 1 }), setItem: vi.fn() };
        loadSettings(storage);
        expect(settings.value).toEqual({ ...DEFAULT_SETTINGS, haptics: false });
    });

    it('survives a throwing storage', () => {
        const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
        expect(() => loadSettings(storage)).not.toThrow();
        expect(() => updateSettings({ sound: false })).not.toThrow();
        expect(settings.value.sound).toBe(false);
    });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
import { signal } from '@preact/signals';

export interface Settings { sound: boolean; music: boolean; haptics: boolean; swipe: boolean; reducedMotion: boolean }
export const DEFAULT_SETTINGS: Settings = { sound: true, music: false, haptics: true, swipe: true, reducedMotion: false };
const KEY = 'cardwar.settings.v1';

export const settings = signal<Settings>(DEFAULT_SETTINGS);
let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;

/** Per-device conveniences only, so localStorage is fine; a blocked storage just means defaults every launch. */
export function loadSettings(backing: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeLocalStorage()): void {
    storage = backing;
    try {
        const raw = storage?.getItem(KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
        const next = { ...DEFAULT_SETTINGS };
        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
            if (typeof parsed[key] === 'boolean') next[key] = parsed[key] as boolean;
        }
        settings.value = next;
    } catch {
        settings.value = DEFAULT_SETTINGS;
    }
}

export function updateSettings(patch: Partial<Settings>): void {
    settings.value = { ...settings.value, ...patch };
    try {
        storage?.setItem(KEY, JSON.stringify(settings.value));
    } catch {
        // Storage blocked: the change still applies for this session.
    }
}

function safeLocalStorage(): Storage | undefined {
    try {
        return typeof localStorage === 'undefined' ? undefined : localStorage;
    } catch {
        return undefined;
    }
}
```

- [ ] **Step 4: Gates and commit** — `npm run lint && npm test && npm run build`.

```bash
git add client && git commit -m "Keep player settings in a signal persisted per device

Sound, vibration, swipe and reduced-motion are device preferences, so
they live in localStorage behind one signal; a blocked storage falls
back to defaults instead of breaking the app.

Closes #<task4>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 5: UI kit on design tokens

**Files:**
- Create: `client/src/ui/kit/tokens.css`, `Button.tsx`, `Sheet.tsx`, `Toast.tsx`, `Badge.tsx`, `Avatar.tsx`, `Tabs.tsx`, `ListRow.tsx`, `BottomNav.tsx`, `index.ts`, `kit.test.tsx`
- Modify: `client/src/ui/styles.css` (import tokens, drop the old `:root`, restyle base elements)

**Interfaces (props):**
```ts
Button: { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'lg'; busy?: boolean; disabled?: boolean; onClick?; type?; 'data-testid'?; children }
Sheet:  { open: boolean; title?: string; onClose: () => void; children }     // bottom sheet, closes on backdrop tap / Escape
Toast:  { message: string | undefined; reason?: string }                     // role=alert, data-reason
Badge:  { tone?: 'neutral' | 'accent' | 'success' | 'danger'; children }
Avatar: { name: string; photoUrl?: string | undefined; size?: number; 'data-testid'?: string }  // initials fallback, onerror → initials
Tabs:   { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }
ListRow:{ leading?; title: string; subtitle?: string; trailing?; onClick? }
BottomNav: { active: 'lobby' | 'friends' | 'shop' | 'profile'; onSelect: (name) => void }   // labels via t('nav.*')
```

Tokens (`tokens.css`), dark default, Telegram overrides where present:

```css
:root {
    --bg: var(--tg-theme-bg-color, #121317);
    --surface: var(--tg-theme-secondary-bg-color, #1c1e25);
    --surface-2: #262932;
    --text: var(--tg-theme-text-color, #f2f2f6);
    --hint: var(--tg-theme-hint-color, #8f93a3);
    --accent: var(--tg-theme-button-color, #3b82f6);
    --accent-text: var(--tg-theme-button-text-color, #ffffff);
    --success: #35c26b;
    --danger: var(--tg-theme-destructive-text-color, #ef4444);
    --gold: #f5c542;
    --felt: #1f6b45;
    --felt-glow: #2a8a5a;
    --radius-s: 8px; --radius-m: 12px; --radius-l: 18px;
    --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;
    --font-s: 0.8rem; --font-m: 0.95rem; --font-l: 1.15rem; --font-xl: 1.6rem;
    --shadow: 0 6px 20px rgb(0 0 0 / 35%);
    --nav-h: 60px;
    color-scheme: dark;
}
:root[data-scheme='light'] { --bg: var(--tg-theme-bg-color, #f6f7fb); --surface: var(--tg-theme-secondary-bg-color, #ffffff); --surface-2: #eef0f5; --text: var(--tg-theme-text-color, #15161b); --hint: var(--tg-theme-hint-color, #6f7382); color-scheme: light; }
```

`main.tsx` sets `document.documentElement.dataset.scheme = telegram.colorScheme`.

- [ ] **Step 1: Failing tests** (`kit.test.tsx`)

```tsx
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, BottomNav, Button, Sheet, Tabs, Toast } from './index';

describe('Avatar', () => {
    it('renders initials when no photo', () => {
        render(<Avatar name="Оля Коваль" />);
        expect(screen.getByText('ОК')).toBeTruthy();
        expect(document.querySelector('img')).toBeNull();
    });
    it('falls back to initials when the photo fails', () => {
        render(<Avatar name="Оля" photoUrl="https://x/p.jpg" />);
        fireEvent.error(document.querySelector('img')!);
        expect(screen.getByText('О')).toBeTruthy();
    });
});

describe('Button', () => {
    it('is disabled while busy and shows a spinner', () => {
        render(<Button busy>Go</Button>);
        const button = screen.getByRole('button');
        expect(button.hasAttribute('disabled')).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
    });
});

describe('Sheet', () => {
    it('closes on backdrop tap and Escape', () => {
        const onClose = vi.fn();
        render(<Sheet open title="T" onClose={onClose}><p>body</p></Sheet>);
        fireEvent.click(screen.getByTestId('sheet-backdrop'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });
    it('renders nothing when closed', () => {
        render(<Sheet open={false} onClose={() => {}}><p>body</p></Sheet>);
        expect(screen.queryByText('body')).toBeNull();
    });
});

describe('Toast', () => {
    it('carries the reason for tests', () => {
        render(<Toast message="x" reason="NOT_YOUR_TURN" />);
        expect(screen.getByRole('alert').getAttribute('data-reason')).toBe('NOT_YOUR_TURN');
    });
});

describe('Tabs / BottomNav', () => {
    it('report selections', () => {
        const onChange = vi.fn(), onSelect = vi.fn();
        render(<Tabs tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} active="a" onChange={onChange} />);
        fireEvent.click(screen.getByRole('tab', { name: 'B' }));
        expect(onChange).toHaveBeenCalledWith('b');
        render(<BottomNav active="lobby" onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('nav-shop'));
        expect(onSelect).toHaveBeenCalledWith('shop');
        expect(screen.getByTestId('nav-lobby').getAttribute('aria-current')).toBe('page');
    });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement the components**

`Avatar.tsx`:

```tsx
import { useState } from 'preact/hooks';

export function initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

export function Avatar({ name, photoUrl, size = 40, 'data-testid': testId }: { name: string; photoUrl?: string | undefined; size?: number; 'data-testid'?: string }) {
    const [broken, setBroken] = useState(false);
    const style = { width: size, height: size, fontSize: size * 0.4 };
    if (photoUrl && !broken) {
        return <img class="avatar" style={style} src={photoUrl} alt="" onError={() => setBroken(true)} data-testid={testId} />;
    }
    return <span class="avatar initials" style={style} data-testid={testId}>{initials(name)}</span>;
}
```

`Button.tsx`: `<button class={`btn ${variant} ${size}`} disabled={disabled || busy} aria-busy={busy} …>{busy && <span class="spinner" aria-hidden />}{children}</button>`.

`Sheet.tsx`: returns `null` when `!open`; otherwise `<div class="sheet-backdrop" data-testid="sheet-backdrop" onClick={onClose}><div class="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>{title && <h2>{title}</h2>}{children}</div></div>` plus a `useEffect` registering `keydown` Escape → `onClose`.

`Toast.tsx`: `message ? <p class="toast" role="alert" data-reason={reason ?? 'generic'}>{message}</p> : null`.

`Badge.tsx`, `ListRow.tsx`: trivial markup with classes `badge <tone>`, `list-row`.

`Tabs.tsx`: `<div role="tablist" class="tabs">{tabs.map(tab => <button role="tab" aria-selected={tab.id === active} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div>`.

`BottomNav.tsx`: four buttons, `data-testid={`nav-${name}`}`, `aria-current={active === name ? 'page' : undefined}`, label `t(`nav.${name}`)`, inline SVG icons (cards, people, bag, person — simple 24px paths).

`index.ts` re-exports all.

- [ ] **Step 4: Styles**

`styles.css`: `@import './kit/tokens.css';` at top, delete the old `:root` blocks, restyle `button` → `.btn` variants, add `.avatar`, `.sheet-backdrop` (fixed, `rgb(0 0 0 / 50%)`), `.sheet` (bottom, `border-radius: var(--radius-l) var(--radius-l) 0 0`, slide-up keyframes), `.tabs`, `.badge`, `.list-row`, `.bottom-nav` (fixed bottom, `height: var(--nav-h)`, `padding-bottom: env(safe-area-inset-bottom)`), `.spinner`. Give `.app` `padding-bottom: calc(var(--nav-h) + var(--space-4))`. Keep table styles for now (Task 10 restyles them).

- [ ] **Step 5: Gates and commit** — `npm run lint && npm test && npm run build`.

```bash
git add client && git commit -m "Add a small UI kit on design tokens

Screens that follow share buttons, sheets, toasts, badges, avatars,
tabs, list rows and a bottom navigation built on one set of CSS tokens
that follow Telegram's theme, so the app looks like one thing.

Closes #<task5>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 6: Motion primitives

**Files:**
- Create: `client/src/motion/index.ts`, `client/src/motion/motion.test.ts`
- Modify: `client/src/test-setup.ts` (stub `Element.prototype.animate` when absent)

**Interfaces:**
```ts
export type Primitive = 'glide' | 'flip' | 'beat' | 'take' | 'discard' | 'deal' | 'shake' | 'pulse';
export function motionEnabled(): boolean;                 // false when prefers-reduced-motion or settings.reducedMotion
export function animate(el: Element, primitive: Primitive, opts?: { from?: DOMRect; to?: DOMRect; durationMs?: number }): Promise<void>;
export function flyTo(el: Element, target: Element): Promise<void>;   // glide using measured rects (FLIP)
```
Every primitive resolves immediately when `motionEnabled()` is false or `el.animate` is missing.

- [ ] **Step 1: Failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../state/settings';
import { animate, motionEnabled } from './index';

describe('motion', () => {
    beforeEach(() => { settings.value = DEFAULT_SETTINGS; });

    it('calls Element.animate with keyframes when enabled', async () => {
        const el = document.createElement('div');
        const finished = Promise.resolve();
        const spy = vi.fn().mockReturnValue({ finished, cancel() {} });
        el.animate = spy as unknown as Element['animate'];
        await animate(el, 'beat');
        expect(spy).toHaveBeenCalled();
        expect(Array.isArray(spy.mock.calls[0]?.[0])).toBe(true);
    });

    it('is a no-op when reduced motion is on', async () => {
        settings.value = { ...DEFAULT_SETTINGS, reducedMotion: true };
        const el = document.createElement('div');
        const spy = vi.fn();
        el.animate = spy as unknown as Element['animate'];
        await animate(el, 'shake');
        expect(spy).not.toHaveBeenCalled();
        expect(motionEnabled()).toBe(false);
    });

    it('resolves when animate is unavailable', async () => {
        const el = document.createElement('div');
        (el as { animate?: unknown }).animate = undefined;
        await expect(animate(el, 'pulse')).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

```ts
import { settings } from '../state/settings';

export type Primitive = 'glide' | 'flip' | 'beat' | 'take' | 'discard' | 'deal' | 'shake' | 'pulse';

const EASE = 'cubic-bezier(.2,.8,.2,1)';

const KEYFRAMES: Record<Exclude<Primitive, 'glide'>, (o: Opts) => { frames: Keyframe[]; ms: number }> = {
    flip: () => ({ frames: [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0)' }], ms: 220 }),
    beat: () => ({ frames: [{ transform: 'scale(1.25) rotate(-6deg)', offset: 0 }, { transform: 'scale(.96) rotate(2deg)', offset: .6 }, { transform: 'scale(1) rotate(0)', offset: 1 }], ms: 320 }),
    take: (o) => ({ frames: [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${o.dx ?? 0}px, ${o.dy ?? 160}px) scale(.7)`, opacity: .2 }], ms: 380 }),
    discard: (o) => ({ frames: [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${o.dx ?? 140}px, ${o.dy ?? -40}px) rotate(25deg)`, opacity: 0 }], ms: 360 }),
    deal: () => ({ frames: [{ transform: 'translateY(-40px) scale(.9)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], ms: 260 }),
    shake: () => ({ frames: [0, -8, 8, -6, 6, 0].map((x) => ({ transform: `translateX(${x}px)` })), ms: 300 }),
    pulse: () => ({ frames: [{ boxShadow: '0 0 0 0 rgb(59 130 246 / 60%)' }, { boxShadow: '0 0 0 12px rgb(59 130 246 / 0%)' }], ms: 700 }),
};

interface Opts { from?: DOMRect; to?: DOMRect; dx?: number; dy?: number; durationMs?: number }

export function motionEnabled(): boolean {
    if (settings.value.reducedMotion) return false;
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Runs one named effect; resolves at once when motion is off or the platform lacks WAAPI. Never throws. */
export async function animate(el: Element, primitive: Primitive, opts: Opts = {}): Promise<void> {
    if (!motionEnabled() || typeof el.animate !== 'function') return;
    const { frames, ms } = primitive === 'glide' ? glideFrames(opts) : KEYFRAMES[primitive](opts);
    try {
        await el.animate(frames, { duration: opts.durationMs ?? ms, easing: EASE, fill: 'none' }).finished;
    } catch {
        // Cancelled by a re-render: fine.
    }
}

function glideFrames({ from, to }: Opts) {
    const dx = (from?.left ?? 0) - (to?.left ?? 0);
    const dy = (from?.top ?? 0) - (to?.top ?? 0);
    return { frames: [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0,0)' }], ms: 280 };
}

/** FLIP: the element is already at its destination; play it from where `target` sits. */
export function flyTo(el: Element, target: Element): Promise<void> {
    return animate(el, 'glide', { from: target.getBoundingClientRect(), to: el.getBoundingClientRect() });
}
```

Add to `test-setup.ts`: `if (!('animate' in Element.prototype)) { Object.defineProperty(Element.prototype, 'animate', { value: undefined, writable: true, configurable: true }); }` — so tests can assign per element.

- [ ] **Step 4: Gates and commit** — `npm run lint && npm test && npm run build`.

```bash
git add client && git commit -m "Add named motion primitives on the Web Animations API

Beats, takes and deals should feel like something. A handful of named
effects, all honouring reduced-motion, give the duel screen and the
later content rule engine one vocabulary for animation.

Closes #<task6>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 7: Audio manager and placeholder sounds

**Files:**
- Create: `client/scripts/gen-sounds.mjs`, `client/public/sounds/default/{slide,beat,take,deal,turn,win,lose}.wav` (generated, committed), `client/src/audio/index.ts`, `client/src/audio/audio.test.ts`
- Modify: `client/package.json` → `"gen:sounds": "node scripts/gen-sounds.mjs"`

**Interfaces:**
```ts
export type Channel = 'sfx' | 'voice' | 'music';
export type DefaultSound = 'slide' | 'beat' | 'take' | 'deal' | 'turn' | 'win' | 'lose';
export class AudioManager {
    constructor(deps?: { context?: () => AudioContext | undefined; fetchImpl?: typeof fetch; now?: () => number });
    installUnlock(target: EventTarget): void;   // first pointerdown/keydown resumes the context
    register(name: string, url: string, channel?: Channel): void;
    play(name: string): void;                    // no-op before unlock, when settings.sound is false (sfx/voice) or music false, or within 150 ms of the same name
    readonly unlocked: boolean;
}
export const audio: AudioManager;  // singleton with the default pack registered under `${BASE_URL}sounds/default/*.wav`
```

- [ ] **Step 1: Generator**

`scripts/gen-sounds.mjs` writes 16-bit mono 22050 Hz WAVs from short synthesized envelopes (sine/noise bursts): `slide` 90 ms filtered noise, `beat` 160 ms 220→110 Hz thump, `take` 240 ms descending triad, `deal` 70 ms click, `turn` 300 ms two-tone chime, `win` 600 ms ascending arpeggio, `lose` 600 ms descending minor third. Pure Node, no deps (write RIFF header + PCM). Run `npm run gen:sounds` and commit the files (they are a few KB each).

- [ ] **Step 2: Failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, settings } from '../state/settings';
import { AudioManager } from './index';

function fakeContext() {
    const source = { buffer: null as unknown, connect: vi.fn(), start: vi.fn() };
    const gain = { gain: { value: 1 }, connect: vi.fn() };
    return {
        ctx: {
            state: 'suspended', resume: vi.fn().mockImplementation(function (this: { state: string }) { this.state = 'running'; return Promise.resolve(); }),
            decodeAudioData: vi.fn().mockResolvedValue({ duration: 0.1 }),
            createBufferSource: vi.fn(() => source), createGain: vi.fn(() => gain), destination: {},
        } as unknown as AudioContext,
        source,
    };
}

describe('AudioManager', () => {
    beforeEach(() => { settings.value = DEFAULT_SETTINGS; });

    it('is a no-op before unlock, then plays after the first gesture', async () => {
        const { ctx, source } = fakeContext();
        let now = 0;
        const fetchImpl = vi.fn().mockResolvedValue(new Response(new ArrayBuffer(8)));
        const audio = new AudioManager({ context: () => ctx, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });
        audio.register('beat', '/x/beat.wav');
        audio.play('beat');
        expect(source.start).not.toHaveBeenCalled();
        const target = new EventTarget();
        audio.installUnlock(target);
        target.dispatchEvent(new Event('pointerdown'));
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        expect(audio.unlocked).toBe(true);
        audio.play('beat');
        await vi.waitFor(() => expect(source.start).toHaveBeenCalledTimes(1));
        now = 100; audio.play('beat');            // de-duped
        now = 400; audio.play('beat');
        await vi.waitFor(() => expect(source.start).toHaveBeenCalledTimes(2));
    });

    it('respects the sound setting', async () => {
        const { ctx, source } = fakeContext();
        const audio = new AudioManager({ context: () => ctx, fetchImpl: vi.fn().mockResolvedValue(new Response(new ArrayBuffer(8))) as unknown as typeof fetch });
        audio.register('beat', '/x/beat.wav');
        const target = new EventTarget(); audio.installUnlock(target); target.dispatchEvent(new Event('pointerdown'));
        settings.value = { ...DEFAULT_SETTINGS, sound: false };
        audio.play('beat');
        await new Promise((r) => setTimeout(r, 10));
        expect(source.start).not.toHaveBeenCalled();
    });

    it('does nothing when no AudioContext is available', () => {
        const audio = new AudioManager({ context: () => undefined });
        audio.register('beat', '/x/beat.wav');
        const target = new EventTarget(); audio.installUnlock(target); target.dispatchEvent(new Event('pointerdown'));
        expect(() => audio.play('beat')).not.toThrow();
        expect(audio.unlocked).toBe(false);
    });
});
```

- [ ] **Step 3: Run, expect failure.**

- [ ] **Step 4: Implement**

```ts
import { settings } from '../state/settings';

export type Channel = 'sfx' | 'voice' | 'music';
export type DefaultSound = 'slide' | 'beat' | 'take' | 'deal' | 'turn' | 'win' | 'lose';
const DEDUPE_MS = 150;

interface Entry { url: string; channel: Channel; buffer?: AudioBuffer; loading?: Promise<void> }

/**
 * One AudioContext for the whole app. Browsers refuse to start audio before a user gesture, so nothing plays until
 * `installUnlock` has seen one; every call before that, or on a device without Web Audio, is a quiet no-op.
 */
export class AudioManager {
    private ctx: AudioContext | undefined;
    private readonly entries = new Map<string, Entry>();
    private readonly gains = new Map<Channel, GainNode>();
    private readonly lastPlayed = new Map<string, number>();
    private readonly makeContext: () => AudioContext | undefined;
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;
    unlocked = false;

    constructor(deps: { context?: () => AudioContext | undefined; fetchImpl?: typeof fetch; now?: () => number } = {}) {
        this.makeContext = deps.context ?? defaultContext;
        this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
        this.now = deps.now ?? (() => performance.now());
    }

    installUnlock(target: EventTarget): void {
        const unlock = () => {
            this.ctx ??= this.makeContext();
            if (!this.ctx) return;
            void this.ctx.resume().then(() => {
                this.unlocked = true;
                target.removeEventListener('pointerdown', unlock);
                target.removeEventListener('keydown', unlock);
            });
        };
        target.addEventListener('pointerdown', unlock);
        target.addEventListener('keydown', unlock);
    }

    register(name: string, url: string, channel: Channel = 'sfx'): void {
        this.entries.set(name, { url, channel });
    }

    play(name: string): void {
        const entry = this.entries.get(name);
        if (!entry || !this.unlocked || !this.ctx || !this.enabled(entry.channel)) return;
        const at = this.now();
        if (at - (this.lastPlayed.get(name) ?? -Infinity) < DEDUPE_MS) return;
        this.lastPlayed.set(name, at);
        void this.load(entry).then(() => {
            if (!entry.buffer || !this.ctx) return;
            const source = this.ctx.createBufferSource();
            source.buffer = entry.buffer;
            source.connect(this.gain(entry.channel));
            source.start();
        });
    }

    private enabled(channel: Channel): boolean {
        return channel === 'music' ? settings.value.music : settings.value.sound;
    }

    private gain(channel: Channel): GainNode {
        let node = this.gains.get(channel);
        if (!node && this.ctx) {
            node = this.ctx.createGain();
            node.connect(this.ctx.destination);
            this.gains.set(channel, node);
        }
        return node as GainNode;
    }

    private load(entry: Entry): Promise<void> {
        if (entry.buffer) return Promise.resolve();
        entry.loading ??= this.fetchImpl(entry.url)
            .then((r) => r.arrayBuffer())
            .then((bytes) => this.ctx?.decodeAudioData(bytes))
            .then((buffer) => { if (buffer) entry.buffer = buffer; })
            .catch(() => { /* a missing sound is not an error worth a toast */ });
        return entry.loading;
    }
}

function defaultContext(): AudioContext | undefined {
    const Ctor = (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : undefined;
}

export const audio = new AudioManager();
for (const name of ['slide', 'beat', 'take', 'deal', 'turn', 'win', 'lose'] as const) {
    audio.register(name, `${import.meta.env.BASE_URL}sounds/default/${name}.wav`);
}
```

In the fake, `gain` returns the same object; `createGain` must exist — it does. The unlock test awaits three microtasks; if flaky, use `await vi.waitFor(() => expect(audio.unlocked).toBe(true))`.

- [ ] **Step 5: Gates and commit** — `npm run lint && npm test && npm run build`.

```bash
git add client && git commit -m "Add an audio manager with generated placeholder sounds

Sounds are part of the satisfaction of a beat. One manager owns the
AudioContext, waits for the first gesture the browser demands, keeps
channels for effects, voices and music, and de-dupes bursts. The
default pack is synthesized by a script until real sounds exist.

Closes #<task7>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 8: Shell and screens

**Files:**
- Create: `client/src/ui/Shell.tsx`, `client/src/ui/Shell.test.tsx`, `client/src/ui/useLaunch.ts`, `client/src/ui/lobby/Lobby.tsx`, `client/src/ui/lobby/Waiting.tsx`, `client/src/ui/lobby/JoinByCode.tsx`, `client/src/ui/lobby/lobby.test.tsx`, `client/src/ui/friends/Friends.tsx`, `client/src/ui/shop/Shop.tsx`, `client/src/ui/profile/Profile.tsx`, `client/src/ui/profile/profile.test.tsx`, `client/src/ui/settings/Settings.tsx`, `client/src/ui/settings/settings.test.tsx`
- Delete: `client/src/ui/Home.tsx`, `client/src/ui/Home.test.tsx`
- Modify: `client/src/main.tsx`, `client/src/ui/App.tsx` (pass `telegram.user` display name through `SignedInPlayer`?) — add `displayName?: string; photoUrl?: string` to `SignedInPlayer` filled from `telegram.user` in `main.tsx` when present (username fallback).

**Interfaces:**
- `Shell` props: `{ player: SignedInPlayer; api: LobbyApi & Pick<ApiClient,'history'>; telegram: Telegram; invite: string | undefined; links: LinkConfig; table: (duelId: string, exit: () => void) => ComponentChildren; pollMs?: number }`.
- `useLaunch({ api, invite })` returns `{ phase: 'loading' } | { phase: 'duel'; duelId } | { phase: 'waiting'; inviteId } | { phase: 'lobby'; error?: string }` — the PoC's launch order, run once per mount.
- Lobby state machine lives in `Shell`: `lobbyScreen: 'start' | { waiting: inviteId }`; the router decides the tab; the duel route is `#/duel/:id`.
- **One-tap invite:** `Lobby`'s Запросити друга calls `createInvite()`, enters the waiting screen **and immediately** calls `telegram.openTelegramLink(shareUrl(link, t('waiting.shareText')))` when `telegram.inTelegram` (in a browser it only shows the code). The waiting screen keeps Поділитися, Скопіювати код and Скасувати.
- Telegram BackButton: visible on `settings` and `duel` is **not** back-able; on `friends/shop/profile` BackButton goes to lobby; on `settings` to profile. Implement in `Shell` with `useEffect` on route.

- [ ] **Step 1: Failing tests** (`Shell.test.tsx`; port the kept cases from `Home.test.tsx` and add):

```tsx
it('lands on the lobby with bottom navigation and the greeting', async () => {
    renderShell(fakeApi());
    expect(await screen.findByTestId('invite')).toBeTruthy();
    expect(screen.getByTestId('nav-lobby').getAttribute('aria-current')).toBe('page');
});

it('invite is one tap: creates, shows the code and opens the Telegram share sheet', async () => {
    const api = fakeApi(); api.createInvite.mockResolvedValue(pending('inv-1')); api.inviteStatus.mockResolvedValue(pending('inv-1'));
    const telegram = { ...resolveTelegram({}), inTelegram: true, openTelegramLink: vi.fn() } as Telegram;
    renderShell(api, { telegram });
    fireEvent.click(await screen.findByTestId('invite'));
    await waitFor(() => expect(screen.getByTestId('invite-code').textContent).toBe('inv-1'));
    expect(telegram.openTelegramLink).toHaveBeenCalledWith(expect.stringContaining('t.me/share/url'));
});

it('back from settings keeps the waiting screen', async () => {
    const api = fakeApi(); api.pendingInvite.mockResolvedValue(pending('inv-open')); api.inviteStatus.mockResolvedValue(pending('inv-open'));
    renderShell(api);
    await screen.findByTestId('invite-code');
    await act(() => navigate({ name: 'settings' }));
    expect(screen.getByTestId('settings-screen')).toBeTruthy();
    await act(() => navigate({ name: 'lobby' }));
    await waitFor(() => expect(screen.getByTestId('invite-code').textContent).toBe('inv-open'));
    expect(api.createInvite).not.toHaveBeenCalled();
});

it('switches tabs through the bottom navigation', async () => {
    renderShell(fakeApi());
    fireEvent.click(await screen.findByTestId('nav-friends'));
    expect(await screen.findByTestId('friends-screen')).toBeTruthy();
    fireEvent.click(screen.getByTestId('nav-shop'));
    expect(await screen.findByTestId('shop-screen')).toBeTruthy();
});
```

`profile.test.tsx`: history rows render from `api.history()` with `data-testid="history-row"` and the empty state; `settings.test.tsx`: toggling `data-testid="setting-sound"` flips `settings.value.sound`. Keep the PoC cases: active duel wins, launch invite accepted once, invite error messages (compare to `t(...)`), expired while waiting, join by code, copy code.

Reset the hash in `beforeEach`: `window.location.hash = ''`.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

`useLaunch.ts` — the body of today's `Home` `useEffect`, returning the phase; `Shell.tsx`:

```tsx
export function Shell({ player, api, telegram, invite, links, table, pollMs = 2000 }: Props) {
    const route = useRoute();
    const launch = useLaunch({ api, invite });
    const [waitingFor, setWaitingFor] = useState<string>();
    const [lobbyError, setLobbyError] = useState<string>();

    useEffect(() => {
        if (launch.phase === 'duel') navigate({ name: 'duel', duelId: launch.duelId });
        if (launch.phase === 'waiting') setWaitingFor(launch.inviteId);
        if (launch.phase === 'lobby' && launch.error) setLobbyError(launch.error);
    }, [launch]);

    useEffect(() => {
        const back = route.name === 'settings' ? () => navigate({ name: 'profile' })
            : TOP_LEVEL.has(route.name) && route.name !== 'lobby' ? () => navigate({ name: 'lobby' })
            : undefined;
        telegram.backButton(back !== undefined, back);
        return () => telegram.backButton(false);
    }, [route, telegram]);

    const startDuel = (duelId: string) => { setWaitingFor(undefined); navigate({ name: 'duel', duelId }); };
    const join = async (inviteId: string) => { try { startDuel((await api.acceptInvite(inviteId)).duelId); } catch (e) { setLobbyError(inviteProblem(e)); } };
    const createInvite = async () => {
        try {
            const created = await api.createInvite();
            setWaitingFor(created.inviteId);
            if (telegram.inTelegram) telegram.openTelegramLink(shareUrl(inviteLink(created.inviteId, links), t('waiting.shareText')));
        } catch (e) { setLobbyError(t('lobby.errors.createInvite', { error: describeError(e) })); }
    };

    if (launch.phase === 'loading') return <p class="notice">{t('app.loading')}</p>;
    if (route.name === 'duel') return table(route.duelId, () => navigate({ name: 'lobby' }));

    const screen = (() => {
        switch (route.name) {
            case 'lobby': return waitingFor
                ? <Waiting inviteId={waitingFor} api={api} pollMs={pollMs} link={inviteLink(waitingFor, links)} onShare={...} onAccepted={startDuel} onExpired={() => { setWaitingFor(undefined); setLobbyError(t('lobby.errors.waitExpired')); }} onCancel={() => setWaitingFor(undefined)} />
                : <Lobby player={player} error={lobbyError} onInvite={createInvite} onJoin={join} />;
            case 'friends': return <Friends onInvite={createInvite} />;
            case 'shop': return <Shop />;
            case 'profile': return <Profile player={player} api={api} />;
            case 'settings': return <Settings />;
        }
    })();
    return (
        <>
            {screen}
            {route.name !== 'settings' && <BottomNav active={route.name} onSelect={(name) => navigate({ name })} />}
        </>
    );
}
```

(The waiting invite survives tab changes because `waitingFor` lives in `Shell`, and survives a reload because `useLaunch` asks `pendingInvite()`.) The `inviteProblem` helper moves from `Home.tsx` into `lobby/Lobby.tsx` and uses `t('lobby.errors.*')`.

`Lobby.tsx`: header with `Avatar` + `t('lobby.greeting', {name})`, tagline, big primary Запросити друга (`data-testid="invite"`), a disabled Швидка гра with `Badge` `t('lobby.soon')` (`data-testid="quick-match"`), `JoinByCode` panel (input `data-testid="join-code"`, button `data-testid="join"`), the three how-to lines, error `role="alert"`.

`Waiting.tsx`: port from `Home.tsx` with `t()`, testids `share-invite`, `copy-code`, `invite-code`, `cancel-invite`; the `CopyButton` moves here.

`Friends.tsx`: `data-testid="friends-screen"`, empty-state text and a Запросити друга button. `Shop.tsx`: `data-testid="shop-screen"`, `Tabs` with the five labels and the "soon" notice. `Profile.tsx`: avatar, username, a link row to settings (`data-testid="open-settings"` → `navigate({name:'settings'})`), history via `api.history()` rendered with `ListRow` (`data-testid="history-row"`, title `t('profile.vs', {name})`, subtitle result + `t('profile.moves', { n, moves: plural(n, …) })`). `Settings.tsx`: `data-testid="settings-screen"`, five toggles (`<label><input type="checkbox" data-testid="setting-<key>" checked={settings.value[key]} onChange=… /></label>`), each calling `updateSettings`.

`main.tsx`: `loadSettings()`, `audio.installUnlock(document)`, `document.documentElement.dataset.scheme = telegram.colorScheme`, render `<Shell …>` in place of `<Home …>`; build `player` with `displayName: telegram.user ? [firstName, lastName].filter(Boolean).join(' ') : username`, `photoUrl: telegram.user?.photoUrl`.

- [ ] **Step 4: Gates**

`npm run lint && npm test && npm run build`; then from the root `make e2e` and `scripts/smoke.sh` against the running stack. The duel E2E still passes because it drives `data-testid=invite`, `invite-code`, `/app/?invite=`, `back-to-lobby`.

- [ ] **Step 5: Commit**

```bash
git add -A client && git commit -m "Replace the single lobby with a navigable Ukrainian app shell

Players get the shape of a real game app: a lobby with a one-tap
invite that opens Telegram's share sheet, friends, shop and profile
tabs (shells where the backend is still to come), settings, and the
Telegram BackButton. The launch order from the PoC is kept in one hook.

Closes #<task8>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 9: View diff to table events

**Files:**
- Create: `client/src/game/diff.ts`, `client/src/game/diff.test.ts`

**Interfaces:**
```ts
export type TableEvent =
    | { type: 'duel_started' }
    | { type: 'card_played'; card: Card; by: 'you' | 'opponent' }        // new attack on the table
    | { type: 'card_beaten'; attack: Card; defence: Card; by: 'you' | 'opponent' }
    | { type: 'cards_taken'; by: 'you' | 'opponent'; count: number }      // table cleared and the defender's hand grew
    | { type: 'attack_ended'; count: number }                             // table cleared to discard
    | { type: 'card_dealt'; count: number; to: 'you' | 'opponent' }
    | { type: 'turn_started'; yours: boolean }
    | { type: 'duel_finished'; result: DuelResult };
export function diffViews(prev: DuelView | undefined, next: DuelView): TableEvent[];
```
Pure, no DOM. MVP 4 extends this list (`hand_changed`, `emote_received`) and feeds the rule engine.

- [ ] **Step 1: Failing tests** — build views with the existing fixtures/builders in `src/game/fixtures/views.ts` (add a tiny `withTable(view, pairs)` helper there if missing):

```ts
it('reports a new attack as card_played by the attacker', () => {
    const before = attackerFresh;                                   // you attack, empty table
    const after = { ...before, table: [{ attack: seven }], hand: before.hand.filter((c) => !sameCard(c, seven)), version: 2 };
    expect(diffViews(before, after)).toContainEqual({ type: 'card_played', card: seven, by: 'you' });
});
it('reports a defence as card_beaten', () => { /* table pair gains defence; by = whoever is not attacker */ });
it('reports a take when the table clears and the defender hand grows', () => { /* cards_taken by defender, count = pairs cards */ });
it('reports attack_ended when the table clears into discard', () => { /* discardCount grows */ });
it('reports turn_started when the mover changes', () => { /* role(prev) !== role(next) */ });
it('reports duel_finished with the caller result', () => { /* phase FINISHED */ });
it('reports duel_started for the first view', () => { expect(diffViews(undefined, attackerFresh)).toEqual([{ type: 'duel_started' }, { type: 'turn_started', yours: true }]); });
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — compare `table` pairs by `cardId(attack)`: pairs in `next` not in `prev` → `card_played` (by `next.attacker === next.you ? 'you' : 'opponent'`); pairs whose `defence` appeared → `card_beaten` (by the non-attacker); `prev.table.length > 0 && next.table.length === 0` → `cards_taken` when the defender's hand count grew (yours: `next.hand.length > prev.hand.length`, opponent: `opponentHandCount` grew) else `attack_ended` with `count = prev.table` card count; `hand.length` / `opponentHandCount` increases outside a take → `card_dealt`; `role(prev) !== role(next)` or first view → `turn_started`; `phase === 'FINISHED'` → `duel_finished` using the same `resultOf` logic as `DuelScreen` (move `resultOf` into `diff.ts` and import it from `DuelScreen`).

- [ ] **Step 4: Gates and commit** — `npm run lint && npm test && npm run build`.

```bash
git add client && git commit -m "Derive table events from consecutive duel views

The server sends state, not events worth animating. A pure diff turns
two views into played, beaten, taken, dealt and turn events; the duel
screen animates them now and the content rule engine will consume the
same stream later.

Closes #<task9>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 10: Duel screen — swipe, avatars, motion, sound

**Files:**
- Modify: `client/src/ui/Table.tsx`, `client/src/ui/Table.test.tsx`, `client/src/ui/DuelScreen.tsx`, `client/src/ui/DuelScreen.test.tsx`, `client/src/ui/styles.css`
- Modify: `client/src/ui/__snapshots__/Table.test.tsx.snap` (regenerate with `npx vitest run -u` after reviewing the diff)

**Interfaces:**
- `Table` gains props `you: { name: string; photoUrl?: string | undefined }`, `opponent: { name: string; photoUrl?: string | undefined }`, `swipe: boolean`, `onSwipePlay?: (card: Card) => void` (defaults to `onHandCard`), and `lastEvents: TableEvent[]` (what to animate after this render).
- Swipe: pointer down on a hand card, move ≥ 56 px upward with |dx| < 40 px, pointer up → `onSwipePlay(card)`; otherwise a tap (< 8 px movement) → `onHandCard`; anything else → no-op. Implemented with Pointer Events and `setPointerCapture`.
- `DuelScreen` keeps `prevView` in a ref, computes `diffViews(prev, view)` on each accepted view, triggers: `card_played` → `audio.play('slide')` + `animate(pairEl, 'deal')`; `card_beaten` → `audio.play('beat')`, `animate(defenceEl, 'beat')`, `telegram.haptic('success')` when `by === 'you'`; `cards_taken` → `audio.play('take')` + `animate(feltEl, 'shake')` when by you; `attack_ended` → `animate(pairsEl, 'discard')`; `card_dealt` to you → `audio.play('deal')`; `turn_started yours` → `audio.play('turn')` + `animate(statusEl, 'pulse')`; `duel_finished` → `audio.play(result === 'LOST' ? 'lose' : 'win')` and the result overlay fades in (`deal` on the section). Illegal move toast → `animate(handEl, 'shake')` + `telegram.haptic('error')`.

- [ ] **Step 1: Failing tests**

`Table.test.tsx`:

```tsx
function drag(el: Element, dx: number, dy: number) {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 300, isPrimary: true });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 300 + dy });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100 + dx, clientY: 300 + dy });
}

it('plays a card on an upward swipe', () => {
    const onHandCard = vi.fn();
    render(<Table {...base} swipe onHandCard={onHandCard} />);
    drag(document.querySelector('.hand-card')!, 0, -80);
    expect(onHandCard).toHaveBeenCalledTimes(1);
});
it('short drag is a no-op', () => { /* dy -20 → not called; but a click still calls once */ });
it('horizontal drag is a no-op', () => { /* dx 90, dy -10 → not called */ });
it('does not swipe when the setting is off', () => { /* swipe={false}, dy -80 → not called */ });
it('shows both avatars', () => {
    render(<Table {...base} you={{ name: 'Я' }} opponent={{ name: 'Оля Коваль' }} />);
    expect(screen.getByTestId('opponent-avatar').textContent).toBe('ОК');
    expect(screen.getByTestId('you-avatar').textContent).toBe('Я');
});
```

`DuelScreen.test.tsx` (mock `../audio` and `../motion`):

```tsx
vi.mock('../audio', () => ({ audio: { play: vi.fn() } }));
vi.mock('../motion', () => ({ animate: vi.fn().mockResolvedValue(undefined), flyTo: vi.fn().mockResolvedValue(undefined), motionEnabled: () => true }));

it('plays the beat sound and haptic when you beat a card', async () => {
    // first view: you defend one open attack; second view (after move): the pair has a defence
    ...
    await waitFor(() => expect(audio.play).toHaveBeenCalledWith('beat'));
    expect(telegram.haptic).toHaveBeenCalledWith('success');
});
it('plays the lose sound on a lost duel', async () => { /* FINISHED view with winner = opponent → audio.play('lose') */ });
```

jsdom lacks `setPointerCapture`: in `test-setup.ts` add `Element.prototype.setPointerCapture ??= () => {}; Element.prototype.releasePointerCapture ??= () => {};`.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement**

Hand card in `Table.tsx`:

```tsx
function HandCard({ card, usable, busy, swipe, onTap, onSwipe }: {...}) {
    const start = useRef<{ x: number; y: number } | null>(null);
    const moved = useRef(false);
    const el = useRef<HTMLButtonElement>(null);
    const onDown = (e: PointerEvent) => { if (!e.isPrimary) return; start.current = { x: e.clientX, y: e.clientY }; moved.current = false; el.current?.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
        if (!start.current || !el.current) return;
        const dy = e.clientY - start.current.y, dx = e.clientX - start.current.x;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved.current = true;
        if (swipe && !busy && Math.abs(dx) < 40 && dy < 0) el.current.style.transform = `translateY(${dy}px)`;
    };
    const onUp = (e: PointerEvent) => {
        if (!start.current || !el.current) return;
        const dy = e.clientY - start.current.y, dx = e.clientX - start.current.x;
        el.current.style.transform = '';
        start.current = null;
        if (swipe && !busy && dy <= -56 && Math.abs(dx) < 40) { onSwipe(card); return; }
        if (!moved.current && !busy) onTap(card);
    };
    return <button ref={el} class={...} data-card={cardId(card)} data-playable={String(usable)} aria-label={cardLabel(card)} disabled={busy}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; if (el.current) el.current.style.transform = ''; }}>
        <CardImage card={card} />
    </button>;
}
```

Remove `onClick` from the hand card (the tap path is the pointer-up branch), so a tap fires once. Keep `.hand` `touch-action: pan-x` so horizontal scrolling of the hand still works and vertical drags reach us.

Header: `<Avatar name={opponent.name} photoUrl={opponent.photoUrl} size={36} data-testid="opponent-avatar" />` + name + count + fan; footer above the hand: `<Avatar … data-testid="you-avatar" />` + `t('duel.you')` (add key `duel.you: "Ти"`).

`DuelScreen.tsx`: after `show(view)` set `events = diffViews(prevView.current, view)`; keep them in state `lastEvents`; a `useEffect` on `lastEvents` runs the triggers listed in Interfaces, finding elements by `data-attack`/`data-card` within the table container ref. Call `audio.play` synchronously in `show()` for sounds (they don't need elements). Pass `swipe={settings.value.swipe}` (read the signal inside the component so toggles apply live), `you={{ name: t('duel.you'), photoUrl: player.photoUrl }}` — add `player: SignedInPlayer` to `DuelScreen` props and pass it from `main.tsx`; opponent `{ name: opponentName }` (opponent photo arrives in MVP 6).

Result overlay: `.result` gets a dark translucent backdrop, big heading with `--gold` for WON, a `data-testid="result"` section already present; `animate(section, 'deal')` on mount.

Styles: felt gets `box-shadow: inset 0 0 60px rgb(0 0 0 / 35%)`, rounded `--radius-l`; `.hand-card.usable` lifts 10 px; `.pair .defence` keeps the rotation; `.status` becomes a pill with `--surface-2`. Keep it restrained; the point is coherence with the kit.

- [ ] **Step 4: Gates**

`npm run lint && npm test && npm run build`; from the root `make e2e` (the E2E taps hand buttons: Playwright `click()` dispatches pointerdown/up at one point → the tap branch) and `scripts/smoke.sh`.

- [ ] **Step 5: Commit**

```bash
git add client && git commit -m "Make the table feel alive: swipe, avatars, motion and sound

Tapping a card worked, but it felt like filling in a form. Hand cards
can be swiped up to play, both players have avatars, and the view diff
drives card glides, a slam on a beat, a shake on a take, a pulse when
it is your turn and win/lose stingers, all switchable in settings.

Closes #<task10>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 11: E2E for the shell, docs, deploy

**Files:**
- Create: `client/e2e/shell.spec.ts`
- Modify: `README.md` ("Telegram Mini App demo" → add "Client structure" and the Ukrainian/i18n rule; the `Develop without Telegram` section mentions the testids contract), `CLAUDE.md` (Conventions → client: i18n, data-testid contract, kit, motion/audio), `docs/poc-telegram-plan.md` (one line: superseded by the MVP spec)

- [ ] **Step 1: Shell E2E**

```ts
import { expect, test } from '@playwright/test';
const PASSWORD = 'correct-horse-battery';

test('the shell navigates, remembers settings and resumes a pending invite', async ({ page }) => {
    await page.goto('/app/');
    await page.getByTestId('dev-username').fill(`e2e-s-${Date.now() % 1_000_000}`);
    await page.getByTestId('dev-password').fill(PASSWORD);
    await page.getByTestId('dev-sign-in').click();
    await expect(page.getByTestId('invite')).toBeVisible();

    await page.getByTestId('nav-friends').click();
    await expect(page.getByTestId('friends-screen')).toBeVisible();
    await page.getByTestId('nav-shop').click();
    await expect(page.getByTestId('shop-screen')).toBeVisible();
    await page.getByTestId('nav-profile').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('setting-sound').uncheck();
    await page.reload();
    // The dev shim signs in again after a reload; settings are per device and must survive it.
    await page.getByTestId('dev-username').fill('x'); // the field keeps autofill off; re-sign-in with the same name
    ...
    await page.goto('/app/#/settings');
    await expect(page.getByTestId('setting-sound')).not.toBeChecked();

    await page.goto('/app/#/');
    await page.getByTestId('invite').click();
    const code = await page.getByTestId('invite-code').textContent();
    await page.reload(); /* sign in again with the same name */
    await expect(page.getByTestId('invite-code')).toHaveText(code ?? '');
});
```

Write the re-sign-in as a helper `signInAs(page, name)` used three times; the username must be the same each time so the pending invite belongs to the same player. Keep the test under 60 s.

- [ ] **Step 2: Run E2E and smoke against the local stack** — `make e2e` (both specs), `scripts/smoke.sh`.

- [ ] **Step 3: Docs**

README: under "Telegram Mini App demo" add

```
### Client structure (MVP 0)

`src/i18n` (all copy, Ukrainian only; `t(key)`), `src/router` (hash routes `#/`, `#/friends`, `#/shop`,
`#/profile`, `#/settings`, `#/duel/:id`), `src/state` (settings signal, localStorage), `src/motion`
(Web Animations primitives), `src/audio` (one AudioContext; `npm run gen:sounds` regenerates the placeholder
pack), `src/game/diff.ts` (view → table events), `src/ui/kit` (tokens + components), `src/ui/{lobby,friends,
shop,profile,settings}`. Tests and the Playwright run read `data-testid` / `data-*` attributes, never copy.
```

CLAUDE.md "Conventions → Client": replace the sentence with: "TypeScript strict, ESLint + Prettier, Vitest; folders `src/api`, `src/auth`, `src/game`, `src/ui`, `src/telegram`, `src/i18n`, `src/router`, `src/state`, `src/motion`, `src/audio`, `src/content` (MVP 4). All copy via `t(key)` in `uk.json`; the catalog test fails on unused/missing keys. Tests and E2E use the `data-testid`/`data-*` contract in `docs/superpowers/plans/2026-10-12-mvp0-app-shell.md` Task 1; never assert on visible text. Game logic stays on the server."

- [ ] **Step 4: Deploy and verify**

```bash
git add -A && git commit -m "Cover the shell with an E2E run and document the client layout

Closes #<task11>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
ssh root@2.31.48.136 'cd /opt/cardwar && git pull -q && (nohup setsid make up > deploy.log 2>&1 &)'
# wait for four healthy containers, then from this machine:
cd client && E2E_BASE_URL=https://cardwar-gaming.duckdns.org npx playwright test && cd .. && BASE_URL=https://cardwar-gaming.duckdns.org scripts/smoke.sh
gh run list --limit 1   # CI green
```

Comment on the milestone's last issue with the production check result and close the milestone:
`gh api -X PATCH repos/javaAndScriptDeveloper/cardwar/milestones/<n> -f state=closed`.

---

## Self-review

**Spec coverage (MVP 0 row + §5):** i18n ✔ (T2); router + BackButton ✔ (T3, T8); lobby/friends/shop/profile/settings shells ✔ (T8); kit + tokens ✔ (T5); motion ✔ (T6, T10); audio ✔ (T7, T10); swipe-to-play ✔ (T10); haptics ✔ (T10); Telegram avatar ✔ (T3, T8, T10); one-tap challenge UX on today's invites ✔ (T8 opens the share sheet right after creating); global offline banner — **deferred to MVP 1/3** where stream state is exposed globally (the duel keeps its local "connection lost" toast); `CoinAmount`/`Countdown` from §5 kit — deferred to MVP 2/3 where they get data (YAGNI). State store `AppStore` with me/wallet/loadout — only `settings` now; the rest arrive with their slices.

**Placeholders:** none of the forbidden phrases remain; the only "…" marks are inside Playwright pseudo-steps in T11 Step 1, which name the helper to write (`signInAs`).

**Type consistency:** `cardId`, `statusState`, `StatusState`, `TableEvent`, `diffViews`, `animate`, `AudioManager.play`, `settings`, `updateSettings`, `navigate`, `useRoute`, `Route`, `TOP_LEVEL`, `Avatar`, `BottomNav` names are used identically across tasks.

**Review Focus:** each of the five lines maps to a named test in T4, T5, T7, T8, T10.
