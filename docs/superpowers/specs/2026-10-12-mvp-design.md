# Cardwar MVP — umbrella design

Date: 2026-10-12. Status: approved in conversation, pending written review.
Supersedes the PoC scope in `docs/poc-telegram-plan.md`; the PoC is complete and deployed.

## 1. Intent

Turn the PoC (two Telegram users play one duel) into an MVP that feels like the popular Durak apps
(Durak Online / Дурак Онлайн): a lobby with a menu, friends, match history, a move timer, avatars,
settings, a polished duel screen, a soft-coin economy with stakes, a daily bonus and a cosmetics shop,
Telegram Stars top-ups, and a content-driven "tricks" engine so card decks can carry animations,
sounds and quirks (for example celebrity-styled decks with per-card reactions).

The UI is Ukrainian. Code, repository, issues, specs and docs stay English.

The owner wants a **backbone with a pretty design**, not finished content: real art, voices and jokes
are authored later and must drop into the same folders without code changes.

### Success criteria

- A new player opens the bot, sees a Ukrainian lobby, claims a daily bonus, picks a stake, finds an
  opponent by quick match or challenges a recent opponent in one tap, plays a duel with a visible
  timer and feels the beat/take animations and sounds, sees coins move, and can buy and equip a deck.
- A deck pack with rules (sound + animation on beat, a sticky-pair hand layout) works end to end
  with placeholder content.
- The owner can see technical and business health in Grafana and debug any duel from logs by id.
- Every slice ships green through the existing gates: `./gradlew spotlessApply build`, client
  `lint && test && build`, smoke and Playwright E2E in CI, deploy to the VPS.

### Out of scope (named follow-ups)

Bots as opponents; random-opponent chat; ratings/leagues; more than two players; refunds UI for
Stars; English/Russian locales (the catalog makes them a one-file change); admin UI for content.

## 2. Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Economy | Soft coins only in-game. Sources: daily bonus, stake wins, Stars top-up packs. Sinks: stakes lost, shop. |
| Opponents | Friends (invite / one-tap challenge) and **quick match** by stake table. No bot yet. |
| Timer | 30 s per move, server-authoritative. Expiry → auto-move; three strikes → forfeit. |
| Friends | Auto-friends: anyone you played appears in "Друзі". No requests. |
| Shop items | `DECK`, `CARD_BACK`, `TABLE`, `FRAME` (avatar frame), `EMOTE`. Sounds ship inside decks. |
| Content | Packs as files in the repo, JSON-schema validated at build, served static. Rule engine runs in the client and is cosmetic by contract. |
| Language | Message catalog, `uk` the only shipped locale; strings via `t(key)`; tests target keys/testids. |
| Matchmaking queue | Postgres table, `FOR UPDATE SKIP LOCKED`, stake escrowed on entry. No Redis/Lua for this. |
| Observability | Same pattern as submissions-checker: Micrometer → Alloy → Grafana Cloud; JSON logs → Loki; generated dashboards and alerts committed as JSON. |
| Sequencing | Vertical slices, each playable when done (see §9). |

## 3. System shape

### Backend (Spring Boot, existing modular monolith)

One new module, the rest grow in place. ArchUnit rules keep applying: modules talk through
services; controllers call services; Redis types only under `session.store`, `session.event`,
`config`.

- **`wallet` (new).** Append-only `coin_transaction` (player, amount ±, kind, reference id,
  created_at) and a `wallet` row with the cached balance (`CHECK balance >= 0`), updated in the same
  transaction under `SELECT … FOR UPDATE`. `WalletService` is the only writer: `credit`, `debit`,
  `escrow`, `settle`, `refund`. `DailyBonusService` lives here. An ArchUnit rule allows ledger writes
  from `wallet.service` only.
- **`session` grows.** A duel carries `stake` and an escrow reference. **Duel clock**: deadline and
  per-player strikes in the duel state, written in the same CAS as the state; a Redis sorted set of
  deadlines; a 1 s scheduler applies auto-moves through `DuelService` under a `SYSTEM` actor and
  forfeits on the third strike (`EndReason.FORFEIT`). **Targeted invites**: today's invite plus an
  optional invitee and a stake — that is a "challenge". **Matchmaking** service over the Postgres
  queue.
- **`account` grows.** Recent opponents (query over duel results) as the friends list; history gains
  the coin delta; Telegram avatar URL and display name refreshed on sign-in.
- **`catalog` + `monetization` grow.** Item types and coin prices; `PurchaseService` (debit wallet,
  grant entitlement through the existing `EntitlementGrantSource` seam); `LoadoutService` (equipped
  items per slot); `StarsService` (invoice link, pre-checkout verification, credit on payment).
- **`bot` grows.** Challenge DMs with a Join button, invoice creation, `pre_checkout_query` and
  `successful_payment` on the webhook.
- **`metrics` (new, cross-cutting).** Business counters/gauges; see §8.
- **Engine untouched.** Auto-moves are ordinary `TAKE` / `END_ATTACK` / `ATTACK` commands.

### Client (Preact + TypeScript, existing)

New folders: `src/i18n`, `src/motion`, `src/audio`, `src/content`, `src/state`, `src/ui/kit`,
`src/ui/{lobby,duel,shop,friends,profile,settings}`. Hash router; Telegram `BackButton` for back.
The duel screen keeps its model: REST is the truth, SSE is a nudge.

### Content

`client/public/packs/<packId>/` with `pack.json`, validated by `client/packs.schema.json` in
`npm run build`. The shop row in Postgres references `packId` only.

## 4. Economy and timing rules

### Coins

- New account: **500** coins.
- **Daily bonus**: once per calendar day, Europe/Kyiv. Streak amounts `[50, 75, 100, 150, 200, 300,
  500]`; day 8+ pays day 7's amount; a missed day resets to day 1. Unique `(player, bonus_date)`
  guards double claims.
- **Stake tables**: `0 (friendly), 100, 500, 1000, 5000`.
- **Escrow** from both players when the duel is created, in one DB transaction; insufficient balance
  → 400 `INSUFFICIENT_COINS`, nothing created. For quick match the escrow happens on queue entry.
- **Settlement**: WON/LOST → winner receives the pot; DRAW → both refunded; forfeit → opponent wins;
  duel state expired in Redis (both abandoned) → both refunded by a sweep that runs from the
  scheduler. Escrow/settle/refund are idempotent on `(duel_id, kind)`.
- **Stars top-up packs**: `1000 coins / 50 ⭐`, `5500 / 250 ⭐`, `12000 / 500 ⭐`. Prices live
  server-side only.

### Stars flow

1. Client `POST /api/v1/shop/stars/invoice {packId}`.
2. Server builds a payload `playerId:packId:nonce` signed with HMAC-SHA256 keyed by a key derived
   from the bot token (same derivation style as the webhook secret) and calls `createInvoiceLink`
   (currency `XTR`).
3. Client opens it with `WebApp.openInvoice`.
4. Webhook receives `pre_checkout_query`: verify signature, pack and amount → `answerPreCheckoutQuery`.
5. Webhook receives `successful_payment`: credit the wallet keyed by `telegram_payment_charge_id`
   (unique), log `event=stars_credited`. Redelivery is a no-op.
6. Refunds: manual through the Bot API for now.

### Timer

- 30 s per move. `DuelView` gains `deadline` (instant) and `strikes` per player. The client measures
  server time offset from the `Date` header on load and renders a countdown.
- Expiry: defender → `TAKE`; attacker who may end → `END_ATTACK`; attacker who has not opened →
  `ATTACK` with the lowest non-trump card (lowest card if only trumps). Each auto-move adds a strike
  to that player; the third ends the duel as `FORFEIT`.
- Disconnects are not special: no move → strikes → forfeit after 90 s.
- The scheduler's auto-move uses the CAS path; a real move that lands first wins the race and the
  auto-move is dropped.

### Quick match

- `matchmaking_entry (player PK, stake, created_at, escrow_ref)`.
- `POST /api/v1/matchmaking {stake}` escrows the stake and inserts the row, then tries to pair:
  `SELECT … WHERE stake = ? AND player <> ? ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
  delete both rows, create the duel with both escrows attached — one transaction. The scheduler
  retries pairing every second for rows that arrived simultaneously.
- `GET /api/v1/matchmaking` → `{status: WAITING|MATCHED, duelId?, waitingSince}`; the client polls
  every 2 s. `DELETE` leaves the queue and refunds. Entries expire after 60 s (refund); the client
  offers "keep waiting" or "invite a friend".

## 5. Client design

### Screens

| Route | Ukrainian title | Content |
|---|---|---|
| `#/` | Грати | balance, daily bonus button with the next amount, Швидка гра + stake picker (bottom sheet), Викликати друга, Запросити за посиланням |
| `#/friends` | Друзі | recent opponents with last-played and record, one-tap Викликати; pending challenges inbox (incoming with Прийняти / Відхилити, outgoing with status) |
| `#/shop` | Магазин | tabs by item type, preview (deck preview shows a few faces + plays its demo sound), Купити / Одягнути; coin packs tab for Stars |
| `#/profile` | Профіль | Telegram avatar + frame, stats (games, wins, win rate, coins won), history list with outcome, opponent, stake, coin delta |
| `#/settings` | Налаштування | sound, music, vibration, "swipe to play", reduced motion |
| `#/duel/:id` | — | the table |

An active duel always wins on launch; a launch invite (deep link) comes next; then the pending
invite; then the lobby — the PoC's order, extended.

### Design system

CSS tokens (colour, radius, spacing, type scale), dark by default, Telegram `themeParams` for the
accent. `src/ui/kit`: Button, Sheet, Toast, Badge, Avatar, CoinAmount, Countdown, Tabs, ListRow.
The table: felt (replaceable by the `TABLE` cosmetic), trump indicator, talon count, opponent fan,
pot chip stack, both avatars with frames and timers.

### Motion

`src/motion` wraps the Web Animations API in named primitives: `glide`, `flip`, `beat`, `take`,
`discard`, `deal`, `shake`, `pulse`. All honour `prefers-reduced-motion` and the settings toggle.
Swipe-to-play: drag a hand card up past a threshold; tap still works. Haptics through the existing
Telegram wrapper on beat, take, win, lose.

### Sound

`src/audio`: one `AudioContext` unlocked on first tap; decoded-buffer cache; channels `sfx`, `voice`,
`music` with volumes from settings; 150 ms de-dupe per sound. Default pack: slide, beat, take, deal,
your-turn, win, lose. Voices come from content packs.

### State and errors

`src/state/AppStore` (Preact signals): me, wallet, loadout, settings, active duel summary;
`refreshMe()` after any wallet-changing action. Ukrainian toasts from `reason` codes; a global
"немає з'єднання" banner driven by stream state and fetch failures.

### i18n

`src/i18n/uk.json` and `t(key, params)`. A Vitest test fails on unused or missing keys. Backend
problem details stay English; the client maps `reason` codes to Ukrainian.

## 6. Content packs and the rule engine

### Layout

```
client/public/packs/<packId>/
  pack.json        manifest + rules
  cards/           36 faces (+ back.svg when the pack ships a back)
  sounds/          mp3/ogg
  anim/            optional sprite / Lottie definitions for custom effects
```

### Manifest

```json
{
  "id": "memes-ua-v1", "version": 1, "type": "DECK",
  "name": { "uk": "Українські меми" },
  "cards": { "ace_of_hearts": { "image": "cards/ace_of_hearts.svg", "title": { "uk": "…" }, "tags": ["banker"] } },
  "sounds": { "lose_money": "sounds/lose_money.mp3" },
  "animations": { "lose_money": { "kind": "sprite", "src": "anim/money.json" } },
  "rules": [
    { "on": "card_beaten", "if": { "beaten": { "tag": "banker" }, "side": "opponent" },
      "do": [ { "sound": "lose_money" }, { "anim": "lose_money", "target": "beaten" },
              { "bubble": { "uk": "Ну все, мінус гроші" } } ],
      "cooldownMs": 4000 },
    { "on": "hand_changed", "if": { "handHas": ["king_of_spades", "jack_of_spades"] },
      "do": [ { "layout": "stick_together", "cards": ["king_of_spades", "jack_of_spades"] } ] }
  ]
}
```

### Vocabulary (versioned with the schema)

- **Triggers:** `duel_started, turn_started, card_dealt, card_played, card_beaten, cards_taken,
  attack_ended, hand_changed, emote_received, duel_finished`.
- **Conditions:** `side` (`you|opponent`); card matchers on `card`, `beaten`, `attacker`
  (`id`, `rank`, `suit`, `tag`); `handHas`; `phase`; `outcome`; `random` (probability); `all`, `any`.
- **Effects:** `sound`, `anim` (built-in primitive or pack-defined), `bubble`, `haptic`, `layout`
  (`stick_together`, `pin_left`, `pin_right`).

### Contract

Effects are cosmetic. The engine has no API to send a move; `layout` only reorders the hand array.
Unknown trigger, condition or effect → skipped with a console warning. Per-rule cooldown, a global
cap of two bubbles on screen. Packs load lazily when equipped. Your opponent's deck reaches you
only as their card back and their emotes; nobody can push sounds into your client.

### Runtime

`src/content/events.ts` diffs consecutive `DuelView`s into trigger events. `src/content/engine.ts`
is a pure `(rules, event, context) → Effect[]`, unit-tested with fixtures. `src/content/runtime.ts`
applies effects through `motion`, `audio` and the hand layout.

### Shipped packs

`classic` (today's SVGs, default sounds, no rules) and `memes-demo` (36 generated placeholder faces
with titles in the manifest, two placeholder sounds, four rules including the sticky pair) — one of
every effect type, end to end.

## 7. Security and integrity

- Ledger is the truth; the balance is derived, checked and recomputed nightly (drift → gauge +
  alert). All money moves are idempotent on a natural key.
- Stars: signed invoice payload, server-side prices, unique charge id, amounts verified at
  pre-checkout. Never log invoice payloads; log the charge id only.
- Rate limits: existing buckets on new endpoints; a tighter bucket for matchmaking, challenges and
  invoice creation.
- `SYSTEM` actor exists only inside the scheduler; it cannot be obtained through HTTP.
- Logging stays ids-only; an integration-test appender fails the build if a token, initData, hash
  or card is logged.
- Secrets: `GRAFANA_CLOUD_*`, `GRAFANA_API_TOKEN` join `/opt/cardwar/.env`; `.env.example` documents
  them.
- Content with real people's likeness or voice is an owner decision (rights, Telegram ToS); the
  repo ships placeholders.

## 8. Observability

Pattern copied from submissions-checker.

- **Metrics:** Actuator + Micrometer Prometheus at `/actuator/prometheus`, compose-network only.
  Technical: HTTP by route template, JVM, Hikari, Lettuce, SSE streams open, scheduler tick
  duration/lag, CAS conflicts, 429s by bucket, Bot API outcomes, webhook updates by kind/outcome,
  wallet drift. Business: sign-ins by method; duels started by mode and stake; finished by outcome
  and end reason; moves and auto-moves; matchmaking wait histogram and queue depth; daily-bonus
  claims by day; coins issued/burned by kind; Stars purchases; shop purchases by type; active duels;
  players active 1d/7d/30d. Counters increment after commit. No player or duel ids as labels; target
  under 600 series.
- **Logs:** Spring Boot structured logging (logstash JSON); MDC `requestId` (`X-Request-Id` in/out),
  `playerId`, `duelId`, `inviteId`, `updateId`. Stable `event=` lines for business events. Nginx
  access log in JSON with the request id.
- **Pipeline:** `observability/alloy/config.alloy` (scrape + Docker log tailing, labels
  `app, service, env, level`), compose profile `observability` with the `alloy` service in prod and
  a local Prometheus+Loki+Grafana harness (`make observability-up`).
- **Dashboards/alerts:** `observability/grafana/build.mjs` generates `cardwar-technical`,
  `cardwar-business`, `cardwar-logs` and `alerting/alert-rules.yaml`; a Vitest test checks dashboard
  metrics ⊆ exported metrics and the series estimate. `make dashboards` / `make alerting` push to
  Grafana Cloud (folder "Cardwar", Telegram contact point). Alerts: service down, 5xx > 5 %,
  scheduler stalled > 2 min, wallet drift ≠ 0, Stars credit failures, SSE streams zero while duels
  are active.

## 9. Delivery

Vertical slices, each its own spec → plan → GitHub milestone with "Depends on" issues, worked with
the autonomous loop in `CLAUDE.md`, deployed when done. From slice 1 on, every slice's definition of
done includes its metrics, log events and dashboard panels.

| Milestone | Slice | Delivers |
|---|---|---|
| MVP 0 | App shell & design system | i18n (uk), router, lobby/friends/shop/profile/settings shells, kit, tokens, motion and audio primitives, Telegram avatar, one-tap challenge UX on today's invites |
| MVP 1 | Observability | metrics, structured logs, Alloy, local harness, dashboards, alerts, push scripts |
| MVP 2 | Wallet, daily bonus, stakes | ledger, bonus, stake tables, escrow/settle/refund, balance in lobby, stake picker on invites |
| MVP 3 | Timer & quick match | duel clock, auto-move, forfeit, matchmaking queue, waiting screen |
| MVP 4 | Content packs & rule engine | schema, validator, events, engine, runtime, `classic` and `memes-demo` packs |
| MVP 5 | Shop & cosmetics & Stars | item types, prices, purchase, loadout at the table, emotes, Stars top-up |
| MVP 6 | Friends, challenges, history | recent opponents, challenge inbox, bot DM, history with coin deltas, profile stats |

Testing per slice: backend integration tests through `ApiDriver` (wallet math, double claim,
concurrent enqueue, timer with a test clock, webhook replay), ArchUnit for new boundaries; client
Vitest (i18n completeness, engine fixtures, motion reduced-motion, audio manager); Playwright E2E
extended slice by slice to: bonus → quick match → timed-out move → forfeit → history deltas → shop
purchase and equip.
