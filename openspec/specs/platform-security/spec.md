# Platform Security

## Purpose

Platform security is the cross-cutting security posture of the application: the authentication filter chain, the principal abstraction that decouples handlers from the login mechanism, service-layer authorization, input validation, rate limiting, secure randomness, secret handling and logging hygiene, so that every module is protected by the same baseline from day one.

## Requirements

### Requirement: Real authentication, no client-supplied identity
Every protected endpoint SHALL derive the acting player from a verified credential. The system MUST NOT accept a player identifier supplied in a request body, query parameter or unverified header as proof of identity.

#### Scenario: Unauthenticated request rejected
- **WHEN** a client calls a protected endpoint with no credential
- **THEN** the API responds with 401 and performs no business logic

#### Scenario: Forged identity in the payload is ignored
- **WHEN** an authenticated player submits a request whose body names a different player identifier
- **THEN** the system acts as the authenticated player and ignores the supplied identifier

#### Scenario: Tampered token rejected
- **WHEN** a client presents a token whose signature does not verify
- **THEN** the API responds with 401

#### Scenario: Expired token rejected
- **WHEN** a client presents a correctly signed but expired token
- **THEN** the API responds with 401

### Requirement: Identity provider abstraction
Authentication SHALL resolve the acting player through a `PrincipalResolver` producing a transport-neutral `PlayerIdentity`. The abstraction MUST NOT assume any specific identity provider, so an external provider can be added later as an additional resolver rather than by rewriting the filter chain or the services.

#### Scenario: Services depend on the abstraction
- **WHEN** a service needs the acting player
- **THEN** it receives a `PlayerIdentity` and does not reference any token format or provider-specific type

#### Scenario: Adding a provider later
- **WHEN** an external identity provider is introduced in a later phase
- **THEN** it is added as an additional resolver implementation with no change to existing service signatures

### Requirement: Stateless session policy
The API SHALL be stateless: no server-side HTTP session SHALL be created for authenticated requests, and CSRF protection SHALL be disabled only because authentication is bearer-token based rather than cookie based.

#### Scenario: No session created
- **WHEN** an authenticated request completes
- **THEN** no HTTP session is created for it

### Requirement: Public and protected endpoint separation
Registration, login, the health endpoint and the API documentation SHALL be reachable without authentication. Every other endpoint SHALL require authentication by default, so that a newly added endpoint is protected unless it is explicitly opened.

#### Scenario: Public endpoints reachable
- **WHEN** an unauthenticated client calls registration, login or the health endpoint
- **THEN** the request is served without a credential

#### Scenario: New endpoints are protected by default
- **WHEN** an endpoint is added without an explicit rule
- **THEN** it requires authentication

### Requirement: Input validation at every boundary
Every API request payload SHALL be validated with bean validation constraints before reaching business logic. Validation failures SHALL produce a 400 RFC 9457 problem detail naming the offending fields, and MUST NOT leak stack traces or internal identifiers.

#### Scenario: Constraint violation
- **WHEN** a request violates a declared constraint
- **THEN** the API responds with 400 and a problem detail listing the offending fields

#### Scenario: Errors do not leak internals
- **WHEN** an unexpected server error occurs
- **THEN** the response carries a generic message with no stack trace or internal identifier

### Requirement: Rate limiting
The API SHALL apply request rate limiting keyed on the authenticated principal, falling back to the client address for unauthenticated requests. Authentication endpoints SHALL carry a stricter limit than the rest of the API. Requests exceeding the limit SHALL be rejected with 429.

#### Scenario: Limit exceeded
- **WHEN** a caller exceeds the configured request rate
- **THEN** further requests are rejected with 429 until the bucket refills

#### Scenario: Stricter limit on login
- **WHEN** a caller repeatedly posts to the login endpoint
- **THEN** they are throttled at the stricter authentication limit rather than the general limit

### Requirement: Secure randomness
All security-relevant randomness — deck shuffling and any generated identifier or token — SHALL use `java.security.SecureRandom`. `java.util.Random` MUST NOT be used for any of these purposes.

#### Scenario: Shuffle uses SecureRandom
- **WHEN** a duel deck is shuffled in production
- **THEN** the randomness comes from a `SecureRandom` instance

#### Scenario: Ban enforced by architecture test
- **WHEN** the architecture test suite runs
- **THEN** it fails if `java.util.Random` is referenced in security-relevant packages

### Requirement: Secrets come from the environment
Database credentials, the Redis password and the token signing secret SHALL be supplied through environment variables. No secret value SHALL be committed to the repository. A `.env.example` SHALL document every required variable with non-production placeholder values, and the real `.env` SHALL remain gitignored.

#### Scenario: No secrets committed
- **WHEN** the repository is inspected
- **THEN** no real credential, password or signing secret is present in tracked files

#### Scenario: Example file documents every variable
- **WHEN** a developer copies `.env.example` to `.env`
- **THEN** every variable the stack requires is present and documented

#### Scenario: Missing signing secret fails fast
- **WHEN** the application starts in the production profile without a token signing secret configured
- **THEN** startup fails with a clear error rather than falling back to a default secret

### Requirement: Logging hygiene
Hands, individual card contents, credentials, password hashes and tokens MUST NOT be logged at INFO level or above. Logs SHALL be structured and SHALL identify players and duels by identifier only.

#### Scenario: Move logged without card detail
- **WHEN** a move is processed and logged at INFO
- **THEN** the log line names the duel and player identifiers but no card

#### Scenario: Credentials never logged
- **WHEN** authentication succeeds or fails
- **THEN** no password, password hash or token appears in any log line at any level

### Requirement: TLS terminated at the reverse proxy
TLS SHALL be terminated by the nginx reverse proxy in front of the application. The application MUST NOT be configured to serve TLS itself, and MUST NOT be published directly to the public network.

#### Scenario: HTTPS served by the proxy
- **WHEN** a client connects to the stack over HTTPS
- **THEN** nginx terminates TLS and forwards plaintext HTTP to the application over the internal network

#### Scenario: Application does not terminate TLS
- **WHEN** the application configuration is inspected
- **THEN** no TLS keystore or certificate is configured in the Spring application

### Requirement: Dependency vulnerability scanning
The build SHALL provide a dependency vulnerability scanning task. It SHALL be runnable on demand and from CI, and SHALL NOT be attached to the default build so that an advisory feed outage cannot block ordinary development.

#### Scenario: Scan runs on demand
- **WHEN** a developer runs the dependency scan task
- **THEN** it analyses the project's dependencies and produces a report

#### Scenario: Default build unaffected
- **WHEN** the standard build task runs
- **THEN** the dependency scan does not execute
