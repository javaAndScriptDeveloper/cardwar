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
