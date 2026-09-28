## Why

The `cardwar` repository currently contains nothing but an unmodified copy of the `springTemplate` starter — Spring Boot 4.1.0, Java 25, Gradle Kotlin DSL, Liquibase, Postgres, Testcontainers, ArchUnit and Spotless, with no domain code at all. Cardwar needs a working, playable foundation before any of the product's differentiating features (Telegram Mini App, skin marketplace, social play) can be built on top of it.

This change delivers that foundation: a headless, transport-agnostic Durak game engine, a data-driven card-skin catalog, real duel sessions between two authenticated players, a freemium entitlement model, security wired in from day one, and a single-command Docker Compose stack deployable to a bare Hetzner VPS. Doing it now — rather than after a Telegram adapter exists — is what keeps the engine free of transport assumptions and prevents an expensive refactor later.

## What Changes

**Rebrand and scaffold**
- **BREAKING** (template-only, no consumers yet): root package `com.example.company` → `cardwar`; `rootProject.name` and Gradle `group` → `cardwar`; the template's Feign `client/` example and `InstancioExampleTest` are deleted.
- Package layout becomes module-first: `engine`, `catalog`, `session`, `account`, `monetization`, `security`, `api`, `config`. Each business module owns its own `controller/service/repository/domain` subpackages; `api/` keeps only cross-cutting web concerns.
- New dependencies: Spring Security, Spring Data Redis, JJWT, bucket4j; OWASP dependency-check as a build plugin (report-only, not gating `check`); `testcontainers-redis` for integration tests.
- ArchUnit gains module-boundary rules on top of the template's existing layering/naming rules; `archRule.failOnEmptyShould` flips to `true` now that real code lands.

**Game**
- A pure-Java Durak engine (36-card deck, two players, throw-in / *podkidnoy* variant, no transferring) with zero Spring, Jakarta or HTTP knowledge: commands in, new state plus events out. It validates every command against the current state rather than trusting the caller.
- Cryptographically secure shuffling via `SecureRandom`; `java.util.Random` is banned in the engine by an ArchUnit rule.

**Catalog**
- Card skins, deck themes, rarities and scoring multipliers live in Postgres, not in code. Adding a skin or reassigning a character to a different rank/suit is a row change with no redeploy. Seed data ships a neutral 36-card classic deck plus one example themed deck using **fictional placeholder characters only**.

**Sessions**
- In-progress duel state (hands, table, talon, trump, turn) lives in Redis behind a `GameStateStore` interface, with a TTL so abandoned duels expire and optimistic concurrency so two simultaneous moves cannot clobber each other. Postgres never holds in-progress hand state — only the final result.
- Move events publish to a Redis channel per duel and fan out to subscribers over SSE, so the second player receives turn updates without polling.

**Accounts, entitlements, security**
- Username/password registration and login with BCrypt hashing, issuing short-lived HS256 JWTs; a `PrincipalResolver`/`PlayerIdentity` abstraction keeps auth independent of any specific identity provider.
- Entitlement and unlock-rule domain model with pluggable `EntitlementGrantSource` implementations (free, gameplay progress, in-game currency) and a deliberately unimplemented purchase source.
- Authorization enforced in the service layer, bean validation on every API boundary, per-principal rate limiting, secrets exclusively from environment variables, and a logging rule that keeps hands and credentials below INFO.

**Infrastructure**
- Compose stack extended from `db` + `app` to `db` + `redis` + `app` + `nginx`, with healthchecks on all four, named volumes, Redis password and AOF persistence, and TLS terminated at nginx (self-signed now, with the certbot hook documented).

**Explicitly out of scope for this change**: Telegram bot or Mini App integration, chat battles, leaderboards, trust index, real payment provider integration, AI/singleplayer opponent, admin UI.

## Capabilities

### New Capabilities
- `durak-engine`: Pure-domain Durak rules and state machine — deck construction, secure shuffle, dealing, turn order, move legality, round resolution, refill, and end/draw conditions. No framework or transport dependencies.
- `card-catalog`: Data-driven deck themes, card skins, rarities and scoring multipliers, resolved by rank+suit and served to clients without the engine ever seeing them.
- `duel-session`: Duel lifecycle between two real accounts — creation, Redis-backed in-progress state with TTL and optimistic concurrency, service-layer authorization and hand redaction, final-result persistence to Postgres, and pub/sub-driven SSE turn updates.
- `player-account`: Player identity — registration, password login, JWT issuance, profile and progress tracking.
- `entitlements`: Freemium ownership model — what owning a skin or theme means, the unlock rules that grant it, and the pluggable grant sources behind them, with payment integration stubbed.
- `platform-security`: Cross-cutting security posture — authentication filter chain, principal abstraction, service-layer authorization, input validation, rate limiting, secure randomness, secret handling, and logging hygiene.
- `deployment-stack`: Single-command Docker Compose deployment on a bare VPS — app, Postgres, Redis and nginx with healthchecks, volumes, TLS termination, environment-based configuration and operational make targets.

### Modified Capabilities

None — `openspec/specs/` is empty; this is the first change in the repository.

## Impact

**Code** — Every file under `src/main/java/com/example/company/` and `src/test/java/com/example/company/` moves to `cardwar/`. `GlobalExceptionHandler` moves from `config/` to `api/`. The template's `client/` package and `InstancioExampleTest` are deleted. All other new code is additive across the eight modules.

**Build** — `build.gradle.kts` (group, new dependencies, OWASP plugin, jacoco exclusion paths and a raised coverage floor), `settings.gradle.kts` (project name), `.github/workflows/ci.yml` (separate dependency-scan job).

**Configuration** — `application.yml`, `application-dev.yml`, `application-prod.yml`, `application-test.yml`, `archunit.properties`. `.env.example` gains `REDIS_PASSWORD`, `JWT_SECRET`, `JWT_TTL` and `DUEL_STATE_TTL`; `.env` remains gitignored.

**Data** — New Liquibase changesets under `db/changelog/changes/`: `player`, `player_progress`, `rarity`, `deck_theme`, `card_skin`, `entitlement`, `unlock_rule`, `duel_result`, plus catalog seed data.

**Runtime dependencies** — Redis becomes a hard runtime dependency alongside Postgres; nginx becomes the TLS-terminating entry point.

**API** — First public surface: `/api/v1/auth/*`, `/api/v1/me`, `/api/v1/duels/*` (including an SSE stream), `/api/v1/catalog/*`, `/api/v1/skins/{code}/unlock`. All errors are RFC 9457 `ProblemDetail` responses via the template's existing handler.

**Future phases** — A Telegram adapter plugs in as an alternative `PrincipalResolver` implementation plus a transport adapter over the same engine API; Telegram Stars plugs in as an `EntitlementGrantSource`; WebSocket plugs in as another subscriber to the existing Redis event publisher. None require touching engine or session logic.
