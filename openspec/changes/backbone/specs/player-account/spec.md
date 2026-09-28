## ADDED Requirements

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

### Requirement: Two accounts suffice for local play
The system SHALL support playing a complete duel between two ordinary registered accounts with no bot, AI or singleplayer opponent, so local testing needs only two registrations.

#### Scenario: Local two-account duel
- **WHEN** two accounts are registered and logged in against a locally running stack
- **THEN** they can create and play a duel to completion using only the public API
