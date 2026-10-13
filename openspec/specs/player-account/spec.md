# Player Account

## Purpose

A player account is a player's identity: registration, password login, JWT issuance, profile and progress tracking. It is the first principal source behind the security layer, and the account a duel session, entitlement and progress record are attached to.

## Requirements

### Requirement: Player registration
The system SHALL allow a new player to register with a username and a password. Usernames SHALL be unique and validated for length and permitted characters. Passwords SHALL be validated for minimum length and SHALL be stored only as a BCrypt hash — never in plaintext and never reversibly encrypted.

#### Scenario: Successful registration
- **WHEN** a client posts a valid, unused username and a valid password to the registration endpoint
- **THEN** a player record is created with a BCrypt password hash
- **AND** the response contains the player identifier and display name but not the password or its hash

#### Scenario: Duplicate username
- **WHEN** a client registers a username that already exists
- **THEN** the API responds with 409 and an RFC 9457 problem detail
- **AND** no second player record is created

#### Scenario: Invalid registration input
- **WHEN** a client posts a username or password violating the validation constraints
- **THEN** the API responds with 400 and a problem detail listing the offending fields

#### Scenario: Password is never stored in plaintext
- **WHEN** a player record is inspected after registration
- **THEN** the stored credential is a BCrypt hash and the plaintext password appears nowhere in the database

### Requirement: Player login issues a token
The system SHALL authenticate a player by username and password and, on success, issue a short-lived signed JWT carrying the player identifier. Token lifetime and signing secret SHALL come from configuration, not from hard-coded values.

#### Scenario: Successful login
- **WHEN** a client posts correct credentials to the login endpoint
- **THEN** the response contains a signed JWT and its expiry

#### Scenario: Wrong password
- **WHEN** a client posts a valid username with an incorrect password
- **THEN** the API responds with 401
- **AND** the response body does not reveal whether the username exists

#### Scenario: Unknown username
- **WHEN** a client posts a username that does not exist
- **THEN** the API responds with 401 with the same response shape as a wrong password

### Requirement: Password-less Telegram accounts
The system SHALL provision an account from a verified Telegram user id alone, with no password. The account SHALL be found again by that Telegram id on every later sign-in, and SHALL get a generated unique username (`tg_<telegramId>`, with a short random suffix if that name is already taken). Password login SHALL reject an account that has no password hash with the same 401 as a wrong password.

#### Scenario: First Telegram sign-in creates the account
- **WHEN** a verified Telegram user signs in for the first time
- **THEN** a player record is created with the Telegram user id, no password hash and zeroed progress

#### Scenario: Repeat Telegram sign-in is idempotent
- **WHEN** the same Telegram user signs in again
- **THEN** the existing player is returned and no second record is created

#### Scenario: Password login on a Telegram-only account
- **WHEN** a client posts any password for the username of a Telegram-only account
- **THEN** the API responds with 401 with the same response shape as an unknown username

### Requirement: Telegram profile follows Telegram
Every Telegram sign-in SHALL copy the verified user's display name (first and last name), `@handle` (Telegram
`username`, only if it is 1-32 letters, digits or underscores) and photo URL (only an absolute `https` URL of at most
512 characters) onto the account, replacing what was stored before, so a rename or a new photo shows at the next
sign-in. Anything that fails those checks SHALL be stored as absent. The generated `username` SHALL never change.
The profile (`GET /api/v1/me`, `player`) SHALL carry `handle` and `photoUrl` when present and omit them otherwise.
Names, handles and photo URLs SHALL NOT be logged.

#### Scenario: A returning user renamed themselves
- **WHEN** a Telegram user signs in again with a new name, a new photo and no handle
- **THEN** the profile shows the new name and photo, has no handle, and the username is still `tg_<telegramId>`

#### Scenario: A photo that is not https
- **WHEN** the verified initData carries a `photo_url` that is not an absolute https URL
- **THEN** the account stores no photo

### Requirement: Player profile and progress
The system SHALL track per-player progress covering duels played, duels won and in-game currency balance, and SHALL expose the authenticated player's own profile, progress and skin collection. A player MUST NOT be able to read another player's profile through this endpoint.

#### Scenario: Reading own profile
- **WHEN** an authenticated player requests their profile
- **THEN** the response contains their identifier, display name, duels played, duels won, currency balance and owned skins

#### Scenario: Progress updates after a duel
- **WHEN** a duel finishes with a winner
- **THEN** both players' duels-played counters increase by one
- **AND** only the winner's duels-won counter increases

#### Scenario: Unauthenticated profile request
- **WHEN** an unauthenticated client requests the profile endpoint
- **THEN** the API responds with 401

### Requirement: Win streak, XP and rank
The system SHALL keep, per player, the current win streak, the best win streak ever and XP, updated once per
participant when a duel's result is recorded, in the same transaction as the result, so a completion that runs twice
cannot count twice. A win SHALL add one to the streak (and raise the best streak when passed) and 30 XP, or 40 XP
when the duel had a stake; a loss SHALL reset the streak to zero and add 10 XP; a draw SHALL leave the streak as it
is and add 15 XP. The rank SHALL follow XP alone: `DURAK` from 0, `PIDKYDNYI` from 100, `KOZYR` from 300, `SHULER`
from 700, `LEHENDA` from 1500. `GET /api/v1/me/progress` SHALL answer the caller's `duelsPlayed`, `duelsWon`,
`winStreak`, `bestWinStreak`, `xp`, `rank`, `nextRankXp` (null at the top rank) and `streakBonusPercent`
(`10 × min(winStreak, 5)`, the bonus the next staked win pays); the same fields SHALL appear under `progress` in
`GET /api/v1/me`. The best win streak SHALL be readable by the monetization module through its `StreakSource` port.
The profile screen SHALL show the rank as a badge (Дурак, Підкидний, Козир, Шулер, Легенда) and an XP bar towards
`nextRankXp` (full at the top rank); the result screen SHALL show the XP the duel added and «Новий ранг: …» when a
threshold was crossed, comparing the progress read before the duel with the one read after it.

#### Scenario: Two wins then a loss
- **WHEN** a player wins two friendly duels in a row and then loses one
- **THEN** after the wins the streak is 2, the XP 60 and `streakBonusPercent` 20
- **AND** after the loss the streak is 0, the best streak still 2 and the XP 70

#### Scenario: A draw keeps the streak
- **WHEN** a player on a streak of 1 draws a duel
- **THEN** the streak is still 1 and the XP is up 15

#### Scenario: Rank crossed
- **WHEN** a player's XP reaches 100
- **THEN** `rank` reads `PIDKYDNYI` and `nextRankXp` 300

### Requirement: Two accounts suffice for local play
The system SHALL support playing a complete duel between two ordinary registered accounts with no bot, AI or singleplayer opponent, so local testing needs only two registrations.

#### Scenario: Local two-account duel
- **WHEN** two accounts are registered and logged in against a locally running stack
- **THEN** they can create and play a duel to completion using only the public API
