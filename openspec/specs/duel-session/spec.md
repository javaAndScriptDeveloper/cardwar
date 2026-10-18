# Duel Session

## Purpose

A duel session is the lifecycle of a game between two real player accounts: creation, Redis-backed in-progress state with a TTL and optimistic concurrency, service-layer authorization and per-player hand redaction, persistence of the final result to Postgres, and pub/sub-driven SSE turn updates, all built on top of the transport-agnostic Durak engine.

## Requirements

### Requirement: Duel creation between two accounts
The system SHALL create a duel between exactly two distinct registered player accounts. Every duel MUST be between two real accounts; the system MUST NOT create duels against bots or AI opponents. A player MUST NOT create a duel against themselves.

#### Scenario: Creating a duel
- **WHEN** an authenticated player creates a duel against another registered player
- **THEN** a duel is created with both participants, a shuffled deck, dealt hands and a revealed trump
- **AND** the response contains the duel identifier and the creator's view of the initial state

#### Scenario: Duel against self is rejected
- **WHEN** a player creates a duel naming themselves as the opponent
- **THEN** the API responds with 400 and no duel is created

#### Scenario: Unknown opponent
- **WHEN** a player creates a duel naming an opponent that does not exist
- **THEN** the API responds with 404 and no duel is created

### Requirement: Duel invites
The system SHALL let an authenticated player create an invite (`POST /api/v1/duels/invites`) that any other authenticated player can accept once (`POST /api/v1/duels/invites/{id}/accept`), starting a duel between the two and returning the acceptor's view. Invites SHALL live behind a store abstraction in Redis with a fixed TTL (default 15 minutes) and SHALL be accepted atomically. The creator SHALL learn the duel id by polling `GET /api/v1/duels/invites/{id}`, which only the creator and the acceptor may read. A player SHALL have at most one pending invite: creating again while one is pending SHALL return that invite, `GET /api/v1/duels/invites/pending` SHALL return it (200) or 204 when there is none, and accepting another player's invite SHALL withdraw the acceptor's own pending invite. An invite carries a stake (see the wallet capability); creating again at a different stake replaces the pending invite.

#### Scenario: Invite accepted
- **WHEN** player B accepts player A's pending invite
- **THEN** a duel between A and B starts, B receives their view, and A's next status read shows `ACCEPTED` with the same duel id

#### Scenario: Own invite
- **WHEN** a player accepts their own invite
- **THEN** the API responds with 400 and the invite stays pending

#### Scenario: Second acceptance
- **WHEN** a player accepts an invite that has already been accepted
- **THEN** the API responds with 409 and no second duel starts

#### Scenario: Expired or unknown invite
- **WHEN** a player accepts or reads an invite that does not exist or has expired
- **THEN** the API responds with 404

#### Scenario: Reopening the app keeps the invite
- **WHEN** a player with a pending invite creates an invite again, or reads their pending invite
- **THEN** both return the same invite id, until it is accepted or expires

#### Scenario: Acceptor's own invite is withdrawn
- **WHEN** a player with a pending invite accepts another player's invite
- **THEN** the acceptor's own invite no longer exists and accepting it responds with 404

#### Scenario: Third party reads an invite
- **WHEN** a player who neither created nor accepted an invite reads its status
- **THEN** the API responds with 403

### Requirement: Listing the caller's active duels
The system SHALL expose `GET /api/v1/duels/active`, returning the caller's in-progress duels as summaries (duel id, opponent id, username, display name and, when present, handle and photo URL, attacker, phase, version) without any card. The full duel view (`GET /api/v1/duels/{id}`) SHALL carry the same opponent profile as `opponentProfile`, and the finished-duel history (`GET /api/v1/me/duels`) SHALL carry it per row as `opponentDisplayName`, `opponentHandle` and `opponentPhotoUrl` next to `opponentUsername`. The state store SHALL keep a per-player index with the same TTL as the duels, and SHALL never return a duel whose state has expired or been deleted.

#### Scenario: Both participants list the duel
- **WHEN** a duel between A and B is in progress
- **THEN** both A's and B's active lists contain it and a third player's does not

#### Scenario: Finished or expired duel
- **WHEN** a duel finishes, or its state expires
- **THEN** neither participant's active list contains it

### Requirement: In-progress state lives behind a store abstraction
Active duel state SHALL be read and written exclusively through a `GameStateStore` interface. Session and engine logic MUST NOT reference Redis types directly, so the backing store can be replaced by configuration rather than by rewriting game logic.

#### Scenario: Session logic is store-agnostic
- **WHEN** the architecture test suite analyses the session service and engine packages
- **THEN** no class outside the store implementation package references Redis client types

### Requirement: Redis-backed active state with expiry
The `GameStateStore` SHALL be implemented against Redis, storing each duel's full in-progress state under a per-duel key with a configurable time-to-live. The TTL SHALL be refreshed on every write so that active duels persist while abandoned duels expire automatically.

#### Scenario: Key carries a TTL
- **WHEN** a duel is created
- **THEN** its Redis key has a positive time-to-live equal to the configured duel state TTL

#### Scenario: TTL refreshed on a move
- **WHEN** a player makes a move after part of the TTL has elapsed
- **THEN** the key's time-to-live is reset to the full configured value

#### Scenario: Abandoned duel expires
- **WHEN** no move is made for longer than the configured TTL
- **THEN** the duel state is removed from Redis and subsequent reads report the duel as not found

### Requirement: Concurrent moves cannot corrupt state
Duel state SHALL carry a version that increments on every accepted command, and writes SHALL be applied conditionally on the version read. When two commands are applied concurrently, exactly one SHALL succeed and the other SHALL be rejected as a conflict rather than overwriting it.

#### Scenario: Concurrent writes
- **WHEN** two commands are applied concurrently against the same version of a duel
- **THEN** exactly one write succeeds
- **AND** the other is rejected with a conflict response and leaves the stored state untouched

### Requirement: Postgres holds only finished results
Postgres MUST NOT hold in-progress hand, table or talon state at any point. When a duel finishes, the system SHALL persist a result record containing both participants, the winner and loser (or a draw marker), start and finish timestamps, the move count and the end reason, then remove the duel from the state store.

#### Scenario: Result persisted on completion
- **WHEN** a duel reaches its finished phase
- **THEN** a duel result row is written with both participants, the outcome and the timestamps
- **AND** the duel's key is deleted from the state store

#### Scenario: Draw recorded without a winner
- **WHEN** a duel ends in a draw
- **THEN** the result row records the draw with no winner and no loser

#### Scenario: No hand state in Postgres
- **WHEN** the database schema is inspected
- **THEN** no table stores hands, table cards or talon contents

### Requirement: Service-layer authorization
Participation checks SHALL be enforced in the session service, not only in the controller. A player who is not a participant of a duel MUST NOT be able to read its state, subscribe to its events, or submit a move — regardless of which transport the request arrives on.

#### Scenario: Non-participant cannot read
- **WHEN** an authenticated player who is not a participant requests a duel's state
- **THEN** the API responds with 403 and no state is disclosed

#### Scenario: Non-participant cannot move
- **WHEN** an authenticated player who is not a participant submits a move
- **THEN** the API responds with 403 and the duel state is unchanged

#### Scenario: Enforcement is not controller-only
- **WHEN** the session service is called directly with a non-participant caller identifier
- **THEN** it raises an authorization error rather than performing the operation

### Requirement: Hand redaction
State returned to a player SHALL include that player's own hand in full, but SHALL reduce the opponent's hand and the talon to counts only. Redaction SHALL apply identically to state read over REST and to state pushed over the event stream.

#### Scenario: Opponent hand hidden
- **WHEN** a participant reads the duel state
- **THEN** the response includes their own cards
- **AND** the opponent's hand and the talon appear only as counts

#### Scenario: Redaction applied to pushed events
- **WHEN** an event is pushed to a subscribed participant
- **THEN** it carries no card that the recipient is not entitled to see

### Requirement: Moves submitted over REST
The system SHALL expose endpoints to create a duel, read a duel's state, and submit a move. Move requests SHALL be validated at the API boundary and then re-validated by the engine. An illegal move SHALL be rejected with a 400 RFC 9457 problem detail identifying the reason, and SHALL leave the duel state unchanged.

#### Scenario: Legal move accepted
- **WHEN** a participant submits a legal move on their turn
- **THEN** the API responds with the updated, redacted state for that player

#### Scenario: Out-of-turn move rejected
- **WHEN** a participant submits a move when it is not their turn
- **THEN** the API responds with 400 and a problem detail
- **AND** the stored duel state is unchanged

#### Scenario: Malformed move payload
- **WHEN** a move request is missing a required field or carries an unknown command type
- **THEN** the API responds with 400 before any engine logic runs

#### Scenario: Leaving a duel
- **WHEN** a participant submits a move of type `RESIGN` before the duel is finished, on their turn or not
- **THEN** the duel finishes at once as a forfeit (`FORFEIT`) with the opponent as the winner
- **AND** the result is persisted and the in-progress state removed exactly as for a duel played to the end

### Requirement: Turn updates are pushed, not polled
Every event produced by the engine SHALL be published to a per-duel Redis channel, and the API SHALL expose a server-sent events stream so a participant receives the opponent's moves without polling. The publisher SHALL be independent of the stream transport so that a WebSocket transport can subscribe to the same channel later without changing the publishing code.

#### Scenario: Opponent move arrives on the stream
- **WHEN** player B holds an open event stream for a duel and player A makes a move
- **THEN** player B receives an event describing that move on the stream

#### Scenario: Stream requires participation
- **WHEN** a non-participant attempts to open the event stream for a duel
- **THEN** the request is rejected with 403 and no events are delivered

#### Scenario: Duel completion is announced
- **WHEN** a duel finishes
- **THEN** both participants receive a duel-finished event carrying the outcome

### Requirement: Move clock
Each move SHALL have a time limit (default 30 seconds) enforced by the server. The duel view SHALL carry the deadline,
whose clock runs (`toMove`) and both players' strikes. When a clock runs out the server SHALL play, for the player
holding the game up, the least damaging legal move (take; end a beaten attack; lead the lowest non-trump), adding a
strike; the third strike SHALL end the duel as a forfeit (`FORFEIT`) with the stake paid to the opponent. A move the
player makes SHALL clear their strikes. A real move and a timeout racing SHALL resolve to exactly one of them.

### Requirement: Quick match
`POST /api/v1/matchmaking {stake}` SHALL pair the caller with the longest-waiting player at the same stake table, or
queue them for 60 seconds. Pairing SHALL escrow both stakes and start the duel atomically; two players entering
together SHALL always be paired; a waiting player who can no longer pay SHALL be dropped. `GET` SHALL report
WAITING, MATCHED (with the duel, once) or EXPIRED, and `DELETE` SHALL leave the queue.

