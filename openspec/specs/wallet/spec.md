# Wallet

## Purpose

Soft coins: how a player gets them (starter coins, a daily bonus, winning a staked duel) and loses them (staking,
unlocking cosmetics), recorded so that no movement can be lost, doubled or forged. Telegram Stars top-ups (MVP 5) are
another credit kind on the same ledger.

## Requirements

### Requirement: Append-only ledger
Every coin movement SHALL be one immutable ledger row (player, signed amount, kind, reference, time), and the wallet
balance SHALL be the running total of that player's rows, changed only together with a new row in one transaction
under a lock on the wallet. A balance SHALL never go below zero. A movement whose (player, kind, reference) already
exists SHALL be a no-op.

#### Scenario: Replayed settlement
- **WHEN** the settlement of a finished duel is attempted a second time
- **THEN** no further coins move and the balance equals the ledger sum

#### Scenario: Debit beyond the balance
- **WHEN** a debit exceeds the balance
- **THEN** the API responds with 400 and reason `INSUFFICIENT_COINS`, and nothing is written

### Requirement: Starter coins
Every new account SHALL receive 500 coins. Accounts that existed before the wallet SHALL keep their previous balance
and receive the same 500 once.

### Requirement: Daily bonus
A player SHALL be able to claim one bonus per calendar day in Europe/Kyiv through `POST /api/v1/wallet/daily-bonus`.
The amount SHALL follow the streak of consecutive days: 50, 75, 100, 150, 200, 300, then 500 from day 7 on; a missed
day SHALL reset the streak to day 1. `GET /api/v1/wallet` SHALL show the balance, whether a bonus is available, its
amount and streak day, and when the next one becomes available.

#### Scenario: Second claim on the same day
- **WHEN** a player claims the bonus twice on one Kyiv day, from one or several devices
- **THEN** exactly one claim pays and the other responds with 409 and reason `BONUS_ALREADY_CLAIMED`

### Requirement: Staked duels
An invite SHALL carry a stake of 0, 100, 500, 1000 or 5000 coins (0 is a friendly duel); any other value is 400
`INVALID_STAKE`, and a creator who cannot afford the stake gets 400 `INSUFFICIENT_COINS`. When the invite is accepted
the stake SHALL be taken from both players in one transaction before the duel starts; if either cannot pay, the
acceptance fails with 400 `INSUFFICIENT_COINS` and nobody is charged. The winner SHALL receive both stakes when the
result is recorded, in the same transaction; a draw SHALL return each stake. Stakes of a duel that expired without a
result SHALL be returned by a periodic sweep. Duel views, active-duel summaries and history entries SHALL carry the
stake, and history entries the caller's net coins for that duel.

#### Scenario: Winner takes the pot
- **WHEN** a 100-coin duel ends with a winner
- **THEN** the winner's balance is up 100 and the loser's down 100 compared with before the invite

#### Scenario: Abandoned duel
- **WHEN** both players abandon a staked duel and its state expires
- **THEN** both stakes are returned exactly once

### Requirement: Streak bonus
When a staked duel is settled for a winner who was already on a win streak, the winner SHALL also receive
`stake × 10% × min(streak before this win, 5)` from the house, as a `STREAK_BONUS` ledger row under the reference
`duel:<duelId>:streak`, in the same transaction and behind the same already-settled guard as the pot, so a repeated
settlement pays neither again. A draw and a friendly duel SHALL pay no bonus. A history entry's net coins SHALL
include the bonus.

#### Scenario: Second staked win in a row
- **WHEN** a player who won their previous duel wins a 100-coin duel
- **THEN** they receive the 200-coin pot and a 10-coin `STREAK_BONUS`, once, however many times completion runs
- **AND** the history entry for that duel reads a net of +110

#### Scenario: Long streak
- **WHEN** a player on a streak of nine wins a 500-coin duel
- **THEN** the bonus is 250 coins (50%, the cap)
