# Social

## Purpose

Friends and challenges: who you played, and playing them again in one tap.

## Requirements

### Requirement: Friends from played duels
`GET /api/v1/friends` SHALL list every player the caller finished a duel against, most recent first, with games,
wins and losses between them, and each friend's display name plus `handle` and `photoUrl` when they have them.
Nothing is stored for this; it is derived from duel results.

### Requirement: Challenges
A player SHALL be able to challenge a friend at a stake (`POST /api/v1/friends/{id}/challenge`); challenging somebody
never played is 400 `NOT_A_FRIEND`. Only the challenged player SHALL be able to accept (others 403) or decline
(`POST /api/v1/duels/invites/{id}/decline`), after which the challenger's invite reads `DECLINED`. Open challenges
SHALL be listed for the challenged player (`GET /api/v1/challenges`, the sender as `from` with display name and,
when present, `handle` and `photoUrl`), and when they have a Telegram account the bot
SHALL message them a button into the challenge; a failed message SHALL not fail the challenge.

### Requirement: Outgoing challenges
The challenger SHALL see the challenges they sent (`GET /api/v1/challenges/outgoing`): the last day's, newest first, at
most 20, each naming the friend and the stake with a status of `WAITING`, `ACCEPTED`, `DECLINED` or `EXPIRED`. An
invite that timed out, or that the challenger replaced with a newer one, reads `EXPIRED`; an answer stays visible
after the invite itself has expired. Open invites by link are not challenges and SHALL not be listed. The existing
`GET /api/v1/challenges` (incoming) is unchanged. The friends screen SHALL show them under its incoming challenges.

### Requirement: Friends leaderboard
`GET /api/v1/friends/leaderboard` SHALL rank the caller together with their friends (as the friends list defines
them) by the coins their wins took in the last 7 days (`coinsWon` = the sum of the stake over duels won), then by
wins, at most 20 entries, each as `{playerId, player: {username, displayName, handle?, photoUrl?}, wins, coinsWon,
you}`. Every friend SHALL appear even with nothing won this week, and the caller SHALL always appear with
`you = true`. Results older than 7 days SHALL count for neither wins nor coins, though they still make a friend.
The profile screen SHALL show this list as «Топ друзів».

#### Scenario: A quiet caller among active friends
- **WHEN** a friend won a 500-coin duel this week, another a 100-coin one, and the caller won two friendly duels
- **THEN** the board reads the first friend, the second, then the caller with 2 wins and 0 coins, flagged `you`

#### Scenario: Last week's win
- **WHEN** a friend's only win against the caller was 8 days ago
- **THEN** the friend is on the board with 0 wins and 0 coins
