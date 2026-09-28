## ADDED Requirements

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
