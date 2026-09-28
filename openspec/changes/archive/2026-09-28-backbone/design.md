## Context

The repository holds an unmodified `springTemplate` starter: Spring Boot 4.1.0, Java 25, Gradle Kotlin DSL, Liquibase, Postgres, Testcontainers, ArchUnit, Spotless, Caffeine caching, and an RFC 9457 `ProblemDetail` exception handler. There is no domain code — every business package is a `.gitkeep`.

Constraints shaping this design:

- **A Telegram adapter is coming in a later phase.** Anything that assumes HTTP or a specific identity provider inside the game logic becomes a refactor later. This is the single strongest force on the architecture.
- **Target is one Hetzner VPS.** Everything runs as containers on one box. No managed services, no cloud SDKs. Operations must be a handful of make targets.
- **Two real players per duel, always.** No bot opponent to hide latency or state bugs behind — both sides are network clients acting concurrently.
- **Freemium is coming, payments are not.** The ownership model has to be right now; the payment provider must be a seam, not a stub scattered through the service layer.
- It is a pet project with one developer. Complexity that does not pay for itself this phase should not be built.

## Goals / Non-Goals

**Goals:**

- A Durak engine that a Telegram adapter, a REST controller or a test harness can drive identically, with no changes to the engine.
- Skins that are data end to end — a new character is an `INSERT`, a reassigned character is an `UPDATE`, neither is a deploy.
- Correct concurrent play between two real clients: no lost moves, no corrupted hands, no player seeing the opponent's cards.
- Security that is structural rather than advisory — authorization in the service layer, illegal-move rejection in the engine, secrets only from the environment.
- `cp .env.example .env && make certs && make up` produces a working HTTPS stack on a fresh VPS.

**Non-Goals:**

- Telegram bot or Mini App integration, WebSocket transport, real payment providers, AI opponent, leaderboards, chat, admin UI.
- Matchmaking beyond a direct challenge — no rating, no queue, no lobby browser.
- Horizontal scaling. One application instance is assumed; nothing in the design forbids more later, but nothing is built or tested for it.
- Reconnect/replay semantics beyond re-reading current state over REST. The SSE stream is a live feed, not an event log with replay.

## Decisions

### Modular monolith with module-owned web layers

`cardwar.<module>.{controller,service,repository,domain}` for each of `catalog`, `session`, `account`, `monetization`; `engine` is a flat pure-domain package; `security`, `api` and `config` hold cross-cutting concerns. Modules talk to each other service-to-service; no module reaches into another's repository or domain internals.

*Alternative considered:* a single top-level `api` package owning every controller, as in the original brief sketch. Rejected because `api` would then depend on every module and become the place every feature touches — the opposite of what makes a module extractable later. `api` keeps only genuinely shared web concerns: the moved `GlobalExceptionHandler`, shared error DTOs, SSE plumbing.

*Alternative considered:* Gradle multi-project with real compile-time module isolation. Rejected as premature for a one-developer pet project; ArchUnit rules give most of the enforcement at a fraction of the build complexity, and the package layout means promoting a module to its own Gradle project later is a directory move.

Enforcement is the point, so ArchUnit carries the boundaries: `engine` may not reference Spring, Jakarta or any sibling module; `engine` may not reference `java.util.Random`; modules must be cycle-free; the template's existing layering and naming rules stay. `archRule.failOnEmptyShould` flips to `true` now that real classes exist — otherwise a typo'd package name would make a rule pass vacuously.

### Engine as a pure function

`DurakEngine.apply(DuelState, PlayerId, GameCommand) → Result(DuelState, List<GameEvent>)`. Immutable records throughout; commands and events are sealed interfaces so exhaustive `switch` catches a missing case at compile time. The engine has no fields that outlive a call, no clock, no I/O, and no injected randomness except at duel creation.

This is what makes the Telegram phase cheap: the adapter's job is `HTTP/Telegram payload → GameCommand` and `GameEvent → wire format`, and nothing in between changes.

Randomness enters through `java.util.random.RandomGenerator`. Production always passes `SecureRandom`; tests pass a seeded generator so a failing game is reproducible. `SecureRandom` is the requirement, but a hard-coded `new SecureRandom()` inside the shuffle would make deterministic tests impossible — hence the parameter, with the secure instance as the only production caller.

*Alternative considered:* a stateful engine object holding the duel. Rejected — the state has to be serialized to Redis between every move anyway, so a mutable in-memory aggregate would be a second source of truth to keep in sync.

### Redis for in-progress state, Postgres for results

In-progress state (hands, table, talon, trump, turn, phase) is high-churn: read-modify-write on every move, worthless the moment the duel ends. It lives in Redis as a JSON document at `cardwar:duel:{id}` behind a `GameStateStore` interface. Postgres holds only `duel_result` rows written once at completion.

TTL is set on every write, so an abandoned duel evaporates on its own — no reaper job, no cleanup migration. Redis runs with AOF on and a named volume so an app or host restart does not wipe every in-progress game.

*Alternative considered:* Postgres for everything with a `duel_state` JSONB column. Simpler stack — one datastore — but every move becomes a row update with the write amplification and vacuum pressure that implies, and abandoned duels need a scheduled cleanup. Redis's TTL and pub/sub together are what make the design simple, not just fast.

The `GameStateStore` interface is deliberately narrow — `find`, `save(state, expectedVersion)`, `delete` — because a narrow interface is what makes the Postgres or in-memory alternative a genuine drop-in rather than an aspiration.

### Optimistic concurrency via a Lua CAS

Two players act concurrently and a naive read-modify-write loses moves: both read version *n*, both write, one silently disappears. `DuelState` carries a `version`; `save` runs a Lua script that compares the stored version and writes only on a match, returning a conflict otherwise. Lua gives atomic compare-and-set in one round trip; `WATCH`/`MULTI` would need a retry loop in application code for the same guarantee.

A conflict surfaces to the client as 409, not as a retry. Retrying a game command is wrong — the state it was computed against no longer exists, and a blind retry could apply a move the player would not have chosen. The client re-reads and decides.

### Pub/sub plus SSE, with the publisher independent of the transport

Each accepted command's events publish to `cardwar:duel:{id}:events`. A `RedisMessageListenerContainer` subscribes and fans out to `SseEmitter`s held per duel per player. SSE over plain Spring MVC — no WebFlux, no STOMP, no extra dependency; `SseEmitter` on the existing servlet stack is enough for a one-way server-to-client feed.

The publisher knows nothing about SSE. Adding WebSocket later means adding a second subscriber, not touching the publishing path.

Redaction happens on the way out, per subscriber: the same event yields different payloads for the two participants. This is why events are published as domain events and rendered per-recipient at the edge, rather than pre-rendered before publishing.

*Alternative considered:* client polling. Rejected outright — it is the thing the pub/sub requirement exists to avoid, and it would make the SSE addition a re-architecture rather than an extension.

### Password + JWT, behind a PrincipalResolver

BCrypt-hashed password, HS256 JWT with the player id as subject, signing secret and TTL from configuration. Stateless: no session store, no sticky sessions, and — the actual reason — a future Telegram `initData` adapter validates Telegram's signature and mints *the same token*, so token verification, the filter chain and every service signature are written once.

Services never see a token. They receive a `PlayerIdentity` resolved by a `PrincipalResolver`. Telegram becomes an additional resolver.

*Alternative considered:* server sessions. Simpler to reason about, but a Mini App client would need a second auth path bolted on, which is exactly the refactor this phase is meant to prevent.

*Alternative considered:* opaque tokens in Postgres. Trivially revocable, at the cost of a database read per request. Deferred — short token TTLs cover the revocation need for now, and the resolver abstraction means switching is contained.

Startup fails fast in the production profile if no signing secret is configured. A defaulted signing secret is worse than no authentication, because it looks like authentication.

### Authorization in the service layer

`DuelService` checks participation itself and raises an authorization error for a non-participant, regardless of caller. The controller's `@PreAuthorize` would be adequate today and useless the moment a Telegram adapter calls the service directly — which is precisely the planned next phase. Redaction lives in the same place for the same reason: `viewFor(duelId, callerId)` is the only way to get state out, and it always redacts.

### Catalog as data, cached

`rarity`, `deck_theme`, `card_skin` tables; effective multiplier is `card_skin.multiplier_override` when present, else `rarity.default_multiplier`, computed in the service. `UNIQUE(theme_id, rank, suit)` makes a duplicated card in a theme a database error rather than a rendering bug. Reads go through the template's existing Caffeine cache — the data is a few hundred rows that change by hand.

Seed data ships a neutral 36-card classic theme plus one themed deck of **fictional placeholder characters**. Real named public figures are deliberately excluded until the naming and likeness question is settled; that is a legal decision, not an implementation detail, and seeding them now would make it expensive to reverse.

*Alternative considered:* skins in a YAML config file. Rejected — a DB table supports the admin UI and per-player theme ownership that entitlements already imply, and Liquibase seed changesets give versioned, reviewable data changes.

### Entitlements with pluggable grant sources

`entitlement(player, target, source, granted_at, expires_at)` and `unlock_rule(target, type, threshold, price)`. `EntitlementGrantSource` implementations are selected by rule type: free, progress, currency now; purchase is present and explicitly reports the capability as unavailable. Adding Telegram Stars later is a new implementation, not a change to `EntitlementService`.

Currency deduction and entitlement insert happen in one transaction — a deduction without a grant is the worst possible failure mode for a freemium system.

### Infrastructure

Compose gains `redis` (password from env, `appendonly yes`, named volume, authenticated-ping healthcheck) and `nginx` (sole published ports, TLS termination, SSE-safe proxy settings: buffering off, long read timeout). `app` gets a readiness healthcheck and `depends_on: service_healthy` for both datastores.

`eclipse-temurin:25-jre` ships no `curl` or `wget`, so the app healthcheck needs one installed in the runtime layer — a small, deliberate addition rather than a silently broken healthcheck.

The OWASP dependency-check plugin is wired as its own task and **not** attached to `check`: it downloads an advisory feed, and a feed outage or a slow first sync must not be able to break an ordinary local build. CI runs it as a separate job.

## Risks / Trade-offs

- **Redis is now a hard runtime dependency; if it is down, no duel can be played.** → Acceptable for a single-VPS pet project. AOF plus a named volume covers restarts. The `GameStateStore` interface means a Postgres-backed fallback implementation is a contained change if this ever matters.
- **A crash between "engine returns finished" and "result row written" loses the result.** → The completion path writes the Postgres result and bumps progress in one transaction, then deletes the Redis key. Ordering it that way means a crash leaves a finished duel still in Redis — recoverable and idempotent on retry — rather than a duel that vanished without a record.
- **SSE has no replay.** A client that misses events while disconnected has a stale view. → Every reconnect re-reads full state over REST, which is authoritative; the stream is an optimization over polling, never the source of truth.
- **A single application instance is assumed.** `SseEmitter`s are held in process memory, so a second instance would only deliver events to clients connected to it. → Redis pub/sub is already the fan-out mechanism, so multi-instance means each instance subscribing and serving its own connections — the design does not block it, but it is untested this phase.
- **In-memory rate limiting resets on restart and is per-instance.** → Adequate as a hook against casual abuse, which is all this phase claims. Bucket4j swaps to a Redis-backed store without changing the filter.
- **JWTs cannot be revoked before expiry.** → Kept short-lived. If revocation becomes a requirement, the `PrincipalResolver` seam allows a denylist check or a switch to opaque tokens without touching services.
- **The package rename touches every existing file.** → It happens first, in one mechanical pass, before any domain code is written, so there is never a merge between renamed and unrenamed code.
- **Throw-in Durak has genuinely fiddly edge cases** — the defender-hand-size cap, refill order, and the simultaneous-empty draw are all easy to get subtly wrong. → The engine is pure and seeded-random, so these are cheap unit tests; each rule in the spec has explicit scenarios, and full-game scenarios cover the interactions between them.
- **The coverage floor rises from 0.0 to a real number**, which can fail the build on a change with weak tests. → That is the intent; the engine, which is where correctness matters most, is the easiest code in the project to test exhaustively.

## Migration Plan

There is no production deployment and no data to migrate — this is the first real change in an empty repository. Deployment is the compose stack itself.

Ordering that matters during implementation:

1. Package rename and dependency changes land first, in one pass, so nothing is written twice.
2. Liquibase changesets are additive and never edited after they are applied; the seed data is its own changeset, separate from the DDL, so catalog content can be reseeded without touching schema history.
3. Hibernate stays on `ddl-auto: validate` — the schema is owned by migrations, and validation failure at startup is the intended signal for drift.

Rollback is `git revert` plus `docker compose down -v` on a machine with no data worth keeping.

## Open Questions

- **Real-person card skins.** Deliberately deferred; placeholder characters ship instead. Needs a naming and likeness decision before any real figure is seeded.
- **Matchmaking.** This phase creates duels by direct challenge. Whether the next iteration adds an open lobby, a queue or rating-based pairing is unresolved and does not affect anything here.
- **Currency earning.** Balances exist and can be spent, but nothing credits them yet beyond seeded values. The rules for earning currency from play belong with the monetization phase.
- **Reconnect semantics.** Full-state re-read is sufficient now. Whether a durable per-duel event log is worth adding depends on what the Mini App client actually needs.
