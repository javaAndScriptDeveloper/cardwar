# MVP 8: Game feel — implementation plan

> Executed inline by the session owner with superpowers:test-driven-development.

**Goal:** the table and the result screen feel like a game people brag about; the hand fits any phone.

**Spec:** `docs/superpowers/specs/2026-10-13-popular-polish-design.md` §1 and §5.

## Task 1: hand fits any viewport (#71)
- CSS: `--hand-card-width` becomes `clamp(40px, calc((100cqw - 16px) / 5.2), 58px)` with `.hand` as a
  size container (`container-type: inline-size`), and the overlap formula unchanged, so 8–12 cards fit
  at 320 px. Test: Playwright project `narrow` (viewport 320×640) runs `duel.spec.ts`'s hand-fit
  assertion; add a Vitest-free check via E2E only (CSS is not unit-testable).

## Task 2: result screen v2 with rematch (#72)
- New `client/src/ui/Result.tsx` (extracted from `DuelScreen.tsx`): props `{ outcome, delta, stake,
  opponent: Participant & { playerId }, record?: { won; lost }, progress?: ProgressLines props,
  onRematch, onHome, rematchBusy }`. Hero with motion classes (`result-hero win|loss|draw`), confetti
  (CSS particles, 24 spans, reduced-motion aware), coin count-up (`CoinAmount` with `countUp`), buttons
  `rematch` / `home` testids. Tests: renders outcome; rematch calls with stake; count-up ends at delta.
- `DuelScreen`: on finish fetch `friends()` for the record (best effort) and poll `challenges()` every
  5 s while the result is open; incoming challenge from the opponent shows a banner `rematch-incoming`
  with accept. «Реванш» = `challenge(opponentId, stake)` then navigate to the waiting screen.

## Task 3: table polish (#73)
- Discard pile: `DiscardPile` component (fanned backs, count badge) replacing the text; pot chip stack;
  `.to-move` glow on the avatar whose clock runs; opponent fan centred; one-time clock hint toast on the
  first own turn (`localStorage` flag `cardwar.hint.clock`).

## Task 4: profile handle + expand (#74)
- Profile shows `@handle` only when present; `main.tsx` calls `telegram.expand()` after `ready()`.
