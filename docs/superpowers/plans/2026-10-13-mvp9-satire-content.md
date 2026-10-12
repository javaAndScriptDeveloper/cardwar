# MVP 9: Satire content — implementation plan

> For agentic workers: execute with superpowers:test-driven-development. Red test first for every step
> that has behaviour. Narrate little; commit per task; `Closes #n` on the last commit of each issue.

**Goal:** two shippable satire decks («Слуги народу», «Блогери і медіа») on the existing content-pack
engine, plus the two engine additions they need (`say` TTS effect, `felt` animation target).

**Spec:** `docs/superpowers/specs/2026-10-13-popular-polish-design.md` §2. Boundaries there are binding.

**Global constraints:** client only (`client/`). All copy Ukrainian; code English. `npm run lint && npm test
&& npm run build` green (build runs `packs:check`, which must validate both packs strictly). No real
photos, no recordings. Pack ids: `sluhy-narodu`, `blogery` (the shop seeds `deck-<id>`; keep them exact).
Generated output is committed (like `memes-demo`).

## Interfaces

- Effect union gains `{ say: Localized; rate?: number; pitch?: number }` (`src/content/types.ts`,
  validator in `src/content/schema.ts`: `say.uk` non-empty string ≤ 120 chars, `rate` 0.5–2, `pitch` 0–2;
  strict mode rejects unknown keys as today). `EFFECTS` gains `'say'`.
- `TARGETS` gains `'felt'`; the runtime resolves it to the element `[data-testid="felt"]` (the pairs
  area stays `table`).
- `src/audio/speech.ts`: `export class Speech { constructor(deps?: { synth?: SpeechSynthesis; now?: () => number }); say(text: string, opts?: { rate?: number; pitch?: number }): boolean; }` returns
  false when no synthesizer exists or sound is off (`settings.value.sound`). Picks a voice whose `lang`
  starts with `uk`, else the default voice with `lang = 'uk-UA'` set on the utterance. Cancels a
  previous utterance before speaking. 150 ms de-dupe per text, like sounds. `export const speech = new Speech()`.
- Runtime (`src/content/runtime.tsx` / `engine.ts`): a `say` effect calls `speech.say`; when it returns
  false the effect degrades to `{ bubble: say, target: 'table' }`.
- Generators: `client/scripts/rosters/<id>.mjs` exports `{ id, name, personas: [{ rank, name, role,
  emoji, colour, tag, quotes: { CLUBS, DIAMONDS, HEARTS, SPADES } }], rules, sounds }`;
  `client/scripts/gen-pack-satire.mjs <id>` renders `public/packs/<id>/` (cards/*.svg, back.svg,
  anim/fx.css, sounds/*.wav, pack.json). `npm run gen:pack:satire -- sluhy-narodu`.
- Sounds synthesized with `scripts/lib/wav.mjs` (see `gen-sounds.mjs`, `gen-pack-memes.mjs`).

## Task 1: `say` effect and `felt` target (issue #75)

Files: `src/content/schema.ts`, `types.ts`, `engine.ts`/`runtime.tsx`, `src/audio/speech.ts` (new),
tests `schema.test.ts`, `runtime.test.tsx`, `src/audio/speech.test.ts` (new), `packs.schema.json` if the
repo keeps one for editors.

Steps:
1. RED `schema.test.ts`: a rule with `{ say: { uk: 'Мінус гроші' } }` validates; `say: { uk: '' }`,
   `rate: 3`, unknown key under say (strict) fail with paths. `target: 'felt'` validates for `anim`.
2. GREEN in schema/types.
3. RED `speech.test.ts` with a fake `SpeechSynthesis` (getVoices, speak, cancel, speaking): picks the
   `uk` voice; sets lang `uk-UA`; returns false with sound off; de-dupes within 150 ms; cancels the
   previous utterance; returns false when no synth.
4. GREEN `speech.ts`.
5. RED `runtime.test.tsx`: a `say` rule on `card_beaten` calls the injected speech with the text and
   rate/pitch; with speech returning false a bubble appears on the table; a `felt` anim adds the css
   class to `[data-testid="felt"]` for `durationMs`.
6. GREEN runtime (inject speech via the existing runtime deps pattern used for `audio`).
7. Lint/test/build; commit `Closes #75`.

## Task 2: generator and «Слуги народу» (issue #76)

Files: `client/scripts/gen-pack-satire.mjs`, `client/scripts/rosters/sluhy-narodu.mjs`,
`client/package.json` script `gen:pack:satire`, output under `client/public/packs/sluhy-narodu/`,
test `src/content/packs.test.ts` (extend: every shipped pack validates strictly, has 36 faces, a back,
`demoSound`, and every rule's `say`/`bubble` text is ≤ 120 chars; the satire packs have the `САТИРА`
marker in `name.uk` suffix «(сатира)»).

Poster card design (SVG 240×336): rounded white frame; persona colour panel; persona name in two lines
max at 30–34 px bold; role line 16 px; emoji badge 44 px in a circle; quote ribbon at the bottom in
14 px italic, wrapped by the generator to ≤ 3 lines (break on spaces, max 22 chars per line); rank and
suit glyph in both corners (as `gen-pack-memes.mjs`); suit colour red for ♦♥. Back: dark blue with a
repeated «СЛУГИ» monogram pattern and a trident silhouette drawn with paths (no external assets).

Roster (one persona per rank; four quotes each, Smak register, parody-obvious; keep within boundaries):
6 Безугла (role «народна депутатка», tag `bezuhla`), 7 Арахамія («голова фракції», `arakhamia`),
8 Гончаренко («термінове звернення», `honcharenko`), 9 Тимошенко («коса», `tymoshenko`),
10 Кличко («мер», `klychko`), J Порошенко («армія, мова, віра», `poroshenko`), Q Єрмак («офіс»,
`yermak`), K Залужний («залізний генерал», `zaluzhnyi`), A Зеленський («президент», `zelenskyi`).
Write all 36 quotes in the roster file; they are the product. Examples of tone: Кличко «Сьогодні в
завтрашній день не всі можуть дивитися», Гончаренко «⚡ Термінове звернення до гоїв. Кінець звернення»,
Арахамія «Це був ситуативний союз з вашою картою».

Rules: as spec §2 (ids there). Sounds: `fanfare`, `applause` (noise bursts), `blackout` (low hum
falling), `ding`. `styles` has `fx-blackout` (felt darkens, two «window» dots flicker) and
`fx-money-rain` style effects as needed.

Steps: RED packs test (fails: pack missing) → generator + roster → GREEN → `npm run packs:check` →
lint/test/build → commit `Closes #76`.

## Task 3: «Блогери і медіа» (issue #77)

Same generator; roster `client/scripts/rosters/blogery.mjs`: 6 Лачен («пише», `lachen`), 7 Раміна
(«контент», `ramina`), 8 Дурнєв («дивиться», `durnev`), 9 Стерненко («дрони», `sternenko`),
10 Притула («збір», `prytula`), J MC Петя («реп», `petya`), Q Леся Нікітюк («хто зверху»,
`nikitiuk`), K Гороховський («банк», `horokhovskyi`), A Усик («I'm very feel», `usyk`).
Sounds: `lose_money` (cash register, as memes-demo), `beatbox` (kick/snare pattern 1.2 s), `applause`,
`whoosh`. Rules as spec §2 incl. `horokhovskyi-beaten` (sound + money_rain + say «Мінус гроші») and
`petya-beats` (beatbox + pulse + say «Йоу»). Back: black with a neon «LIVE» motif.

Steps as Task 2; commit `Closes #77`.

## Review focus

- A device without `speechSynthesis` or with sound off never throws and still shows the bubble.
- Two `say` rules firing in one event do not overlap (second cancels first).
- `packs:check` strictness: any unknown key in the generated manifests fails the build.
- Quote length: nothing overflows the card; the generator wraps and the test caps length.
