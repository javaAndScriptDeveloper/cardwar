# MVP 4: Content Packs & Rule Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Decks become content packs (files in the repo) that carry card faces, sounds, animations and *rules*: when a
table event happens and conditions match, cosmetic effects run (sound, animation, speech bubble, haptic, hand layout).
The demo deck proves every effect type, including the "these two cards always sit together" layout rule.

**Architecture:** Client-only. `client/public/packs/<packId>/pack.json` + assets, validated against
`client/packs.schema.json` by `npm run packs:check` (part of `npm run build`). `src/content/` holds: `types.ts` (manifest
types), `loader.ts` (fetch + validate + cache, lazy per pack), `engine.ts` (pure `(rules, event, context) → Effect[]`),
`runtime.ts` (applies effects through `motion`, `audio`, a bubble layer and the hand layout, with per-rule cooldowns and a
cap of two bubbles), `layout.ts` (pure hand ordering for `stick_together`, `pin_left`, `pin_right`). Events come from
`src/game/diff.ts` (extended with `hand_changed` and `emote_received` placeholder). The equipped deck is a local setting
until the shop's loadout exists (MVP 5): `settings.deck` (default `classic`). `CardImage` resolves faces through the
equipped pack (`classic` = today's SVGs).

**Spec:** `docs/superpowers/specs/2026-10-12-mvp-design.md` §6.

## Global Constraints

- Effects are cosmetic by contract: the engine/runtime expose no way to send a move; `layout` only reorders the array the
  hand renders. Table logic, selectors and data-* contracts stay as they are (`data-card` ids unchanged).
- Unknown trigger/condition/effect → skipped with `console.warn` once, never a crash. Schema version field `version: 1`.
- Your opponent's pack never plays on your device (only your equipped pack's rules run, on events from your view).
- All copy in packs is `{ "uk": "..." }`; UI strings still via `t()`.
- Reduced motion / sound / haptics settings gate effects (through the existing primitives).
- Pack assets are static files under `/app/packs/` (nginx already serves `/app/`).

## Pack format (binding)

```json
{
  "id": "memes-demo", "version": 1, "type": "DECK",
  "name": { "uk": "Мемна колода (демо)" },
  "back": "cards/back.svg",
  "cards": { "ACE_OF_HEARTS": { "image": "cards/ACE_OF_HEARTS.svg", "title": { "uk": "Банкір" }, "tags": ["banker"] } },
  "sounds": { "lose_money": "sounds/lose_money.wav" },
  "animations": { "money_rain": { "kind": "css", "className": "fx-money-rain", "durationMs": 1200 } },
  "rules": [
    { "id": "banker-beaten", "on": "card_beaten", "if": { "beaten": { "tag": "banker" } },
      "do": [ { "sound": "lose_money" }, { "anim": "money_rain", "target": "beaten" },
              { "bubble": { "uk": "Мінус гроші!" }, "target": "beaten" } ], "cooldownMs": 4000 },
    { "id": "inseparable", "on": "hand_changed", "if": { "handHas": ["KING_OF_SPADES", "JACK_OF_SPADES"] },
      "do": [ { "layout": "stick_together", "cards": ["KING_OF_SPADES", "JACK_OF_SPADES"] } ] }
  ]
}
```

Triggers: `duel_started, turn_started, card_dealt, card_played, card_beaten, cards_taken, attack_ended, hand_changed,
emote_received, duel_finished`. Conditions: `side` (`you|opponent`), matchers `card|beaten|attacker` (`id|rank|suit|tag`),
`handHas`, `outcome`, `random` (0..1), `all`, `any`. Effects: `sound`, `anim` (built-in primitive name or pack
animation id) with `target` (`played|beaten|defence|hand|table|you|opponent`), `bubble`, `haptic`, `layout`.

## Tasks

1. Types, JSON schema, `packs:check` validator script (no deps: a small hand-written validator in Node is fine), wired
   into build; `classic` pack manifest describing today's SVGs (no rules).
2. `memes-demo` pack: generated placeholder faces (script, like gen-cards) with titles/tags in the manifest, two
   generated placeholder sounds, four rules covering every effect type, including the sticky pair.
3. `engine.ts` + `layout.ts` pure functions with exhaustive Vitest fixtures (every trigger, condition, effect,
   unknown-skipping, cooldown, random seeded).
4. `loader.ts`, `runtime.ts` (bubble layer component `PackBubbles`, css-animation effect class toggling, audio
   registration of pack sounds under `packId:name`), DuelScreen integration (diff events → runtime), `CardImage` faces and
   back from the equipped pack, hand rendered through `layout`.
5. Settings: deck picker listing installed packs (`/app/packs/index.json` generated at build) with a preview of a few
   faces; persisted per device.
6. E2E: with `memes-demo` equipped, a duel still plays to a result; the hand shows `KING_OF_SPADES` right next to
   `JACK_OF_SPADES` whenever both are held (DOM order check).
