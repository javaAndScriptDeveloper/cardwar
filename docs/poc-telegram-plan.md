# PoC plan — Telegram Mini App demo

Local mirror of the GitHub milestone `PoC: Telegram Mini App demo`
(project: https://github.com/users/javaAndScriptDeveloper/projects/3). GitHub is authoritative for status;
this file records the shape of the plan and the decisions behind it so the repo is self-contained.

## Goal

Two Telegram accounts open the Mini App, one invites the other with a deep link, they play one Durak duel to
WON / LOST / DRAW using the default (classic) card design. No skins, no currency, no ranking, no chat. Code
stays clean along the existing seams so those come later without rewrites.

## Decisions (made 2026-10-11; change them in the issues if you disagree)

| Topic | Decision | Why |
|---|---|---|
| Matchmaking | Invite deep link: A creates an invite, shares `https://t.me/<bot>/<app>?startapp=<inviteId>`, B accepts | Telegram-native, minimal; no queue, no rating |
| Client stack | Vite + TypeScript + Preact, in `client/` | Tiny bundle inside Telegram, React-compatible, fast to extend |
| Hosting | nginx serves `client/dist` at `/app/` on the same origin as `/api` | No CORS, one certificate, one deploy unit |
| Auth | `initData` verified server-side by a new `PrincipalResolver`, exchanged for our existing JWT | Every service and filter unchanged; this seam was reserved for exactly this |
| Accounts | Telegram users get password-less accounts (`telegram_user_id`, nullable `password_hash`) | No second identity model |
| Live updates | SSE stays a nudge; the client re-fetches `GET /duels/{id}` on every event | Reconnect becomes trivial; the stream is never the source of truth |
| Dev loop | Client runs in a plain browser with a dev shim using password login | Develop and E2E-test without Telegram |
| Game logic | Server only; client selectors mirror rules just to enable/disable controls | Engine stays the judge |

## Issues and order

Backend track and client track run in parallel. Infra anytime. Docs last.

| # | Title | Area | Depends on |
|---|---|---|---|
| 1 | Password-less player accounts for Telegram sign-in | backend | — |
| 2 | Telegram initData authentication via a second PrincipalResolver | backend | 1 |
| 3 | Duel invites: create, share, accept | backend | — |
| 4 | List the caller's active duels for reconnect | backend | — |
| 5 | Serve the Mini App from nginx on the same origin | infra | 7 (placeholder page is fine earlier) |
| 6 | Deploy to the VPS with a real certificate and register the bot | infra | 5 |
| 7 | Scaffold the Mini App client (Vite + TypeScript + Preact) | client | — |
| 8 | Typed API client with auth bootstrap and SSE subscription | client | 7, 2 |
| 9 | Default card deck assets (36 classic SVG cards) | client | 7 |
| 10 | Lobby: start screen, create invite, share link, accept from start_param | client | 3, 4, 8 |
| 11 | Game table: render hand, table, trump, counts and whose turn | client | 9, 8 |
| 12 | Moves: tap to attack or defend, Take and End attack | client | 11 |
| 13 | End-to-end test: two players play a duel through the Mini App | client | 12, 10 |
| 14 | Document the Telegram demo: bot setup, deploy, play | docs | all |

Critical path: 1 → 2 → 8 → 10 → 12 → 13. Start 1, 3, 4, 7, 9 immediately.

## Infrastructure state (2026-10-12)

VPS ordered and bootstrapped (see CLAUDE.md "Production server"): Docker, swap, firewall, deploy key, repo at
`/opt/cardwar`, production `.env`, DNS for `cardwar-gaming.duckdns.org`. Issue #6 therefore reduces to: real
certificate (`make certs-prod`), BotFather registration, smoke test over the public URL, renewal cron.

## Known follow-ups that may surface

- `EventSource` cannot send an `Authorization` header. Issue 8 must pick: fetch-based streaming with the bearer
  header, or a short-lived signed query token for `/events`. Prefer fetch streaming (no new token type).
- The creator of an invite has no duel id to subscribe to until the acceptor arrives; issue 3 settles for
  polling `GET /invites/{id}` every 2 s. Acceptable for the PoC.
- Telegram requires a valid public certificate; nothing in the Mini App can be tested on a phone before issue 6.

## Out of scope, by decision

Currency earning (balances stay at 0), skins beyond classic, real payments, reconnect replay, multi-instance,
leaderboards, chat, bots/AI opponent.

## Later phases (not planned yet)

Skin selection in the Mini App using the catalog and entitlements; Telegram Stars as an
`EntitlementGrantSource`; currency earning rules; WebSocket as a second subscriber to the event channel.
