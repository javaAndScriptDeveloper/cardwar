# MVP 3: Move Timer & Quick Match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Backend and client tracks run in parallel
> against the API contract below.

**Goal:** Every move has a 30-second clock enforced by the server (auto-move on expiry, three strikes forfeit), and a
player can find an opponent at a stake table without knowing anyone.

**Architecture:** The duel clock lives beside the duel state in Redis: `StoredDuel` gains `deadline` and per-player
`strikes`, written in the same compare-and-set as the state, and a sorted set `cardwar:duel:deadlines` indexes
deadlines. A 1-second scheduled `DuelClockService` takes due duels, works out who was holding the game up, and applies
an ordinary engine command on that player's behalf through `DuelService` (so authorization, CAS, events, completion and
settlement are the same path as a real move); the third strike applies the new engine command `Resign`, which ends the
duel with `EndReason.FORFEIT`. A real move landing first wins the CAS and the auto-move is dropped. Quick match is a
Postgres queue (`matchmaking_entry`) in the session module; entering takes a transaction-scoped advisory lock per stake
table, pairs with the oldest waiting player of the same stake, escrows both stakes and starts the duel in that
transaction (a failed duel start rolls the escrow back). The other player learns the duel id from their entry row.

**Spec:** `docs/superpowers/specs/2026-10-12-mvp-design.md` §4 (Timer, Quick match).

## Global Constraints

- Move timeout `cardwar.duel.move-timeout` (env `DUEL_MOVE_TIMEOUT`, default 30s); strikes to forfeit: 3.
- Auto-move: the defender facing an undefended attack takes; the attacker with everything beaten ends the attack; the
  attacker facing an empty table attacks with the lowest non-trump card (the lowest trump if only trumps).
- Engine stays pure; the only engine change is `GameCommand.Resign` and `EndReason.FORFEIT`.
- Quick-match stake tables are the invite tables `0, 100, 500, 1000, 5000`; entries expire after 60s
  (`cardwar.matchmaking.entry-ttl`). Queue rows are never escrowed; the stake is escrowed at pairing time
  (Ruling vs spec §4 "escrow on entry": no refund paths for leaving or expiry, same guarantee that a paired player can
  pay).
- Metrics: `cardwar_moves_total{outcome="auto"}`, `cardwar_matchmaking_total{event}` (entered, matched, left, expired),
  `cardwar_matchmaking_wait_seconds` (timer).

## API contract

```
DuelView     { ..., deadline: string /* ISO instant the player to move must act by; absent when finished */,
               toMove: string /* player id whose clock runs */, strikes: { you: number, opponent: number } }
OutcomeView.reason may now be 'FORFEIT'

POST   /api/v1/matchmaking  { stake }  → MatchView     400 INVALID_STAKE | INSUFFICIENT_COINS
GET    /api/v1/matchmaking             → MatchView | 204 when the caller is not queued
DELETE /api/v1/matchmaking             → 204

MatchView { status: 'WAITING' | 'MATCHED' | 'EXPIRED', stake: number, since: string, duelId?: string }
```

The client measures `serverNow - clientNow` from the `Date` response header and renders the countdown from
`deadline` with that offset.

## Review Focus

1. A real move at the same moment as the auto-move → exactly one applies (CAS), no double strike.
2. Two players entering the same table simultaneously → paired, never both left waiting.
3. A queued player who spent coins meanwhile → skipped at pairing, removed from the queue, the other keeps waiting.
4. Clock survives an app restart (deadline is in Redis, scheduler resumes).
5. A finished duel never gets an auto-move (deadline removed on finish).

## Tasks

1. Engine: `Resign` command and `FORFEIT` (engine unit tests).
2. Duel clock in `StoredDuel` + Redis (deadline, strikes, deadline index), `toMove` derivation, views carry it.
3. `DuelClockService` scheduler with an injectable clock; auto-move choice; strikes; forfeit; metrics.
4. Matchmaking queue, service, controller, metrics; integration tests per Review Focus.
5. Client (parallel): quick match flow (stake picker → searching screen with cancel and elapsed time → table),
   countdown bar at the table for whoever is to move with urgency at ≤10s, strikes dots, `FORFEIT` result copy.
6. E2E: two browsers quick-match at the 0 table and play to a result; docs, spec, deploy.
