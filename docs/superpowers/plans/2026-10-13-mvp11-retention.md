# MVP 11: Retention hooks — implementation plan

> For agentic workers: superpowers:test-driven-development on every step. Backend gate
> `./gradlew spotlessApply build` (one Gradle build at a time; detached + poll when long); client gate
> `npm run lint && npm test && npm run build`. Commit per task; `Closes #n` on the last commit.

**Goal:** reasons to come back: win streaks with a bonus, XP ranks, daily missions, a friends
leaderboard, a streak reminder from the bot, and the client surfaces for all of it.

**Spec:** `docs/superpowers/specs/2026-10-13-popular-polish-design.md` §4 and §5.

**Constraints:** new changeset `014-progress-missions.sql` only. Module rules (ArchUnit): progress/XP
in `account`; coins (streak bonus, missions) in `wallet`; leaderboard in `session`; the reminder in
`wallet` behind a port implemented in `bot` (mirror `monetization.payment.PaymentGateway` →
`bot.client.BotPaymentGateway`). Logging: ids only. Kyiv day = `DailyBonusService.KYIV`.
The client's result screen is being rebuilt in MVP 8 by another worker: do NOT edit
`client/src/ui/DuelScreen.tsx`; expose the data and components, and add the lobby/profile surfaces.

## Interfaces

- `player_progress` + `win_streak INT NOT NULL DEFAULT 0`, `best_win_streak INT NOT NULL DEFAULT 0`,
  `xp INT NOT NULL DEFAULT 0`.
- `AccountService.recordDuelPlayed(UUID playerId, DuelOutcomeKind kind, boolean staked)` replaces the
  boolean overload (update `DuelCompletionService`): WIN → streak+1, best=max, xp +30 (+10 staked);
  LOSS → streak 0, xp +10; DRAW → xp +15. Returns `ProgressView`.
- `AccountService.progressOf(UUID)` → `ProgressView(duelsPlayed, duelsWon, winStreak, bestWinStreak,
  xp, Rank rank, Integer nextRankXp, int streakBonusPercent)`; `Rank` enum DURAK(0) PIDKYDNYI(100)
  KOZYR(300) SHULER(700) LEHENDA(1500); `streakBonusPercent = 10 * min(winStreak, 5)`.
- `AccountService.bestWinStreakOf(UUID)` → int, and a `cardwar.monetization.grant.StreakSource` bean in
  account config backed by it (MVP 10 defines the interface with a 0-returning default; replace it).
- `GET /api/v1/me/progress` → `ProgressView` (MeController in `api`).
- Wallet: `CoinKind.STREAK_BONUS`, `MISSION_REWARD`. `WalletService.settle(duelReference, winner)` gains an
  overload `settle(duelReference, winner, int streakBeforeWin)` paying the bonus
  `stake * 10 * min(streakBeforeWin, 5) / 100` from the house with reference `duel:<id>:streak`
  (idempotent through the ledger unique key). `DuelCompletionService` passes the winner's streak before
  this win (read progress before recording).
- `daily_mission(player_id UUID, day DATE, code VARCHAR(16), progress INT, claimed_at TIMESTAMPTZ NULL,
  PRIMARY KEY (player_id, day, code))`. Definitions in code: `PLAY_3(target 3, 60)`, `WIN_2(2, 120)`,
  `STAKED_WIN_1(1, 150)`. `MissionService.record(UUID playerId, boolean won, long stake)` (called from
  `DuelCompletionService` for both players), `missionsOf(UUID)` → `List<MissionView(code, target, progress,
  reward, claimed)>`, `claim(UUID, code)` → `WalletView` (400 `MISSION_INCOMPLETE`, 409 `ALREADY_CLAIMED`).
  `GET /api/v1/me/missions`, `POST /api/v1/me/missions/{code}/claim`.
- `GET /api/v1/friends/leaderboard` → `List<LeaderboardEntry(PlayerProfileView player, int wins,
  long coinsWon, boolean you)>`: friends (as `FriendsService` defines them) plus the caller, results of
  the last 7 days from `duel_result` (coinsWon = sum of stake over wins), sorted coinsWon desc, wins desc,
  top 20.
- Reminder: `wallet.notify.StreakReminderGateway { void remindStreak(long telegramUserId, int streakDays); }`
  implemented in `bot.client` (DM with a Play button, same style as challenge DMs); `StreakReminderService`
  `@Scheduled(cron = "0 0 19 * * *", zone = "Europe/Kyiv")`: players with streak ≥ 2 and no claim today;
  table `streak_reminder(player_id, day, PRIMARY KEY)` records sends. Needs `AccountService.telegramUserIdOf`.
- Client types: `ProgressView`, `MissionView`, `LeaderboardEntry`; `ApiClient.progress()`, `missions()`,
  `claimMission(code)`, `leaderboard()`; state `src/state/progress.ts` (signal + `refreshProgress()`).

## Task 1: progress, XP, ranks, endpoint (issue #80)
Changeset 014 (progress columns + daily_mission + streak_reminder tables, one changeset), entity,
service, controller; tests in `TelegramProfileIntegrationTest`-style new `ProgressIntegrationTest`:
win/loss/draw transitions through a real duel (use `ApiDriver` helpers that finish a duel by resign),
rank thresholds, `/me/progress` shape, `bestWinStreakOf`. Update `openspec/specs/player-account/spec.md`.

## Task 2: streak bonus (issue #81)
`StakeIntegrationTest`: a second staked win in a row pays stake + 10% bonus; the ledger shows
`STREAK_BONUS` once even if completion runs twice. Update `openspec/specs/wallet/spec.md`.

## Task 3: missions (issue #82)
`MissionIntegrationTest`: three missions listed with zero progress; after duels progress moves; claim
pays once; incomplete → 400; day rollover resets (inject `Clock`). Spec wallet updated.

## Task 4: leaderboard (issue #83)
`FriendsIntegrationTest` extension: ordering, 7-day window, caller included with `you=true`.
Spec social updated. README API table rows for every new endpoint.

## Task 5: reminder (issue #84)
Unit/integration test with a recording gateway and an injected clock: sends once, skips claimed-today,
skips streak < 2, records in `streak_reminder`. Bot side: `BotStreakReminderGateway` builds the message
«🔥 Серія {n} днів згорить опівночі. Забери бонус» with the Play button; test like existing bot tests.

## Task 6: client surfaces (issue #85)
Files: `client/src/api/{types,client}.ts`, `client/src/state/progress.ts`, `client/src/ui/lobby/Lobby.tsx`
(+ new `StreakChip.tsx`, `Missions.tsx`), `client/src/ui/profile/Profile.tsx` (+ `RankBadge.tsx`,
`Leaderboard.tsx`), `client/src/ui/shop` untouched, i18n keys (`progress.rank.*` Дурак/Підкидний/Козир/
Шулер/Легенда, `missions.*`, `leaderboard.*`, `streak.*`). Tests with testing-library as the existing
screens do; data-testids: `streak-chip` (`data-streak`), `mission-row` (`data-code`, `data-progress`,
`data-claimed`), `claim-{code}`, `rank-badge` (`data-rank`), `xp-bar`, `leaderboard-row` (`data-player`,
`data-you`). Lobby loads progress + missions on mount and after a claim refreshes wallet (`refreshWallet`).
Also export `ProgressLines` (a small component taking `before?: ProgressView`, `after: ProgressView`) from
`client/src/ui/profile/ProgressLines.tsx` for the result screen to use later (tested standalone).

## Review focus
- Completion runs twice (sweep + move): streak, XP and missions must not double count — key on duel id
  where needed (`duel_result` row exists check already guards the whole block; keep the progress and
  mission updates inside the same guarded transaction).
- Draw: no streak change, no bonus, PLAY_3 progresses, WIN_* does not.
- Kyiv day rollover at 00:00 with DST.
- Reminder never logs names; only ids.
