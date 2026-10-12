# MVP 6: Friends, Challenges, History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Anyone you have played is a friend; challenging one is one tap (pick friend, pick stake); the bot DMs them a
Join button; they see incoming challenges in the app and can accept or decline; the profile shows stats and history.

**Architecture:** Friends are derived, not stored: `FriendsService` aggregates `duel_result` rows of the caller
(opponent, games, wins, losses, last played). A challenge is an invite with an `invitee`: only the invitee may accept;
`RedisInviteStore` keeps a per-invitee set of incoming invite ids (same TTL); the invitee may decline (status
`DECLINED`, the creator's poll sees it). On creation the session asks the bot to DM the invitee when the account is a
Telegram one (`AccountService.telegramUserIdOf`), with a Join button to `/app/?invite=<id>`.

**Spec:** `docs/superpowers/specs/2026-10-12-mvp-design.md` §2 (auto-friends), §5 (friends screen).

## API contract

```
GET  /api/v1/friends → FriendView[]  (most recently played first, at most 50)
FriendView { playerId, username, displayName, played, won, lost, lastPlayedAt }
POST /api/v1/friends/{playerId}/challenge { stake } → InviteView (+ invitee)  400 INVALID_STAKE|INSUFFICIENT_COINS|NOT_A_FRIEND
GET  /api/v1/challenges → ChallengeView[]  (incoming, pending)
ChallengeView { inviteId, from: { playerId, username, displayName }, stake, expiresAt }
POST /api/v1/duels/invites/{id}/decline → 204   (invitee only; 403 otherwise)
InviteView.status may be 'DECLINED'; InviteView.invitee?: playerId
Accepting a challenge as anyone but the invitee → 403
```

## Tasks

1. Friends aggregation + endpoint; tests.
2. Targeted invites (invitee, incoming index, decline, accept guard); tests.
3. Bot DM on challenge (best effort, never fails the challenge); test with the failing test Bot API URL.
4. Client: friends list with record and "Викликати" (stake picker), incoming challenges inbox with accept/decline and a
   lobby badge, waiting screen shows DECLINED, profile stats (games, wins, win rate, coins won).
5. E2E: two players finish a duel, then one challenges the other from Friends and the other accepts from the inbox.
