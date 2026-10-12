# MVP 2: Wallet, Daily Bonus, Stakes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Backend and client tracks run in
> parallel against the API contract below.

**Goal:** Soft coins with an append-only ledger, a daily bonus with a streak, and duels played for a stake that the
winner takes, visible in the lobby, at the table, on the result screen and in the history.

**Architecture:** New module `cardwar.wallet` (domain, repository, service, controller, dto) owns the `wallet`,
`coin_transaction` and `daily_bonus` tables. `WalletService` is the only writer of coins; every movement is a ledger
row with a natural idempotency key `(player_id, kind, reference)`. `account` keeps registering players and asks the
wallet to open one; the existing `player_progress.currency_balance` becomes legacy (migrated once, no longer read or
written). Stakes ride on invites: the stake is checked when the invite is created and escrowed from both players in
one Postgres transaction when it is accepted, before the duel starts; the stake is stored on the duel (`StoredDuel`)
so views and settlement know it. `DuelCompletionService` settles: the winner gets the pot, a draw refunds both. A
scheduled sweep refunds escrows whose duel vanished (both players abandoned it). The engine is untouched.

**Spec:** `docs/superpowers/specs/2026-10-12-mvp-design.md` §4 (coins, stakes; timer and quick match are MVP 3).

## Global Constraints

- Amounts are `long` coins, never negative in a wallet (`CHECK balance >= 0`).
- Every ledger write is idempotent on `(player_id, kind, reference)`; a retried settle or claim never pays twice.
- New account: 500 coins (`STARTER`). Existing accounts get their legacy `currency_balance` plus 500 once.
- Daily bonus: once per calendar day in Europe/Kyiv; streak amounts `[50, 75, 100, 150, 200, 300, 500]`, day 8+ pays
  500, a missed day resets to day 1.
- Stake tables: `0, 100, 500, 1000, 5000`. 0 means a friendly duel with no escrow.
- Errors: unmet rule = 400 with a problem `reason` (`INSUFFICIENT_COINS`, `INVALID_STAKE`), duplicate claim = 409
  with reason `BONUS_ALREADY_CLAIMED`.
- Logging: ids and amounts only. Metrics: `cardwar_coins_total{kind,direction}` (amount), `cardwar_bonus_claims_total{day}`.
- `wallet` may be called by `account`, `session`, `monetization`; it depends on no sibling module.

## API contract (client and backend build against this)

```
GET  /api/v1/wallet                  → WalletView
POST /api/v1/wallet/daily-bonus      → WalletView            (409 reason BONUS_ALREADY_CLAIMED)
GET  /api/v1/wallet/transactions     → CoinTransactionView[]  (newest first, at most 50)

WalletView          { balance: number, dailyBonus: { available: boolean, amount: number, streakDay: number,
                      nextAt: string /* ISO instant of the next Kyiv midnight when not available */ } }
CoinTransactionView { amount: number /* signed */, kind: 'STARTER'|'DAILY_BONUS'|'STAKE_ESCROW'|'STAKE_PAYOUT'|
                      'STAKE_REFUND'|'PURCHASE'|'LEGACY', createdAt: string }

POST /api/v1/duels/invites  body (optional) { stake: number }   → InviteView (+ stake)
     400 reason INVALID_STAKE | INSUFFICIENT_COINS
POST /api/v1/duels/invites/{id}/accept                          → DuelView
     400 reason INSUFFICIENT_COINS (either side short at acceptance)
InviteView  { ..., stake: number }
DuelView    { ..., stake: number }
DuelSummary { ..., stake: number }
DuelHistoryEntry { ..., stake: number, coinDelta: number /* signed, net for the caller */ }
GET /api/v1/me → progress.currencyBalance is the wallet balance
```

A pending invite with a different stake than requested is replaced (the old one is withdrawn).

## Review Focus

1. Two accepts racing on one invite → exactly one escrow pair; the loser of the Redis claim is refunded.
2. Acceptor or creator spent coins between invite and accept → 400 INSUFFICIENT_COINS, nobody charged.
3. Daily bonus double-tap / two devices → one claim, the second is 409; Kyiv midnight boundary.
4. Draw → both refunded; a settle replayed after a crash pays nothing twice.
5. Duel abandoned (Redis TTL) → the sweep refunds both stakes exactly once.

## Backend tasks

1. **Ledger and wallet** — changeset `007-wallet.sql` (tables, migration of legacy balances with `LEGACY` +
   `STARTER` rows), entities, `WalletService.open/credit/debit/balance/transactions`, `AccountService` opens a wallet
   on registration and reads balances from it; `CurrencyGrantSource` debits through it. Tests: ledger sums equal
   balance; debit below zero is 400; idempotent credit.
2. **Daily bonus** — `DailyBonusService` with an injected `Clock`; `WalletController` endpoints. Tests: streak
   progression, reset after a gap, double claim 409, Kyiv boundary.
3. **Stakes** — invite `stake`, validation, escrow on accept (Postgres first, refund on lost claim), `StoredDuel.stake`,
   views carry stake, settlement in `DuelCompletionService`, abandoned-duel refund sweep (`@Scheduled`, configurable),
   history `stake` + `coinDelta`. Tests per Review Focus.
4. **Metrics + spec + docs** — counters above, dashboard panels (coins issued/burned, bonus claims, stake mix),
   `openspec/specs` updates (new capability `wallet`), README API table.

## Client tasks (parallel agent)

5. API client + types per the contract; `CoinAmount` kit component; lobby balance chip and daily-bonus card (claim,
   streak, countdown to next); stake picker bottom sheet on invite (tables, disabled when balance too low); waiting
   screen and table show the stake/pot; result screen shows the coin delta; profile history shows deltas and the
   wallet transactions list. Ukrainian copy via `t()`; `data-testid` contract; unit tests.
6. E2E: both players claim the bonus, play a 100-coin duel, balances move by ±100 (read from `data-balance`).
