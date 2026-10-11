# Cardwar

A two-player **Durak** (throw-in / *podkidnoy*, 36 cards, no transferring) service with a data-driven card-skin
catalog and a freemium ownership model. Headless by design: the game engine knows nothing about HTTP, Telegram or
databases, so the REST API here is one adapter and a Telegram Mini App can be the next.

## Stack

| Concern             | Choice                                                                 |
|---------------------|------------------------------------------------------------------------|
| Language / runtime  | Java 25, auto-provisioned via Gradle toolchains                        |
| Framework           | Spring Boot 4.1 (Spring Framework 7), Spring Security, Spring Data     |
| Build               | Gradle 9.6 (Kotlin DSL)                                                |
| Finished results    | PostgreSQL 17, schema owned by Liquibase, Hibernate `validate` only    |
| In-progress duels   | Redis 7 (per-duel key with TTL, Lua compare-and-set, pub/sub events)  |
| Auth                | Username/password, BCrypt, short-lived HS256 JWT, bucket4j rate limits |
| Live updates        | Server-sent events fed from the Redis event channel                    |
| API docs            | springdoc-openapi (Swagger UI at `/swagger-ui.html`)                   |
| Errors              | RFC 9457 `ProblemDetail` responses                                     |
| Testing             | JUnit 5, Testcontainers (Postgres + Redis), ArchUnit, JaCoCo gate      |
| Deployment          | Docker Compose: `db` + `redis` + `app` + `nginx` (TLS termination)     |

## Working on this repo

`CLAUDE.md` is the operating manual (rules, loop, commands, gotchas). The current phase is planned as GitHub
issues under the milestone `PoC: Telegram Mini App demo`; `docs/poc-telegram-plan.md` mirrors that plan and the
decisions behind it. The behavioural contract lives in `openspec/specs/`.

## Prerequisites

- **JDK 25** — or nothing at all; Gradle downloads the right JDK via the toolchain resolver.
- **Docker** — for the local datastores, the full stack and the Testcontainers-based tests.
- `curl`, `jq` and `openssl` for the smoke test and certificate generation.

## Quick start

```bash
# Run the app on the host; docker-compose starts Postgres and Redis for you (loopback ports only)
make run          # or: ./gradlew bootRun

# Run against throwaway Testcontainers datastores (no docker-compose, no config)
make dev          # or: ./gradlew bootTestRun

# Run the full test suite: engine unit tests, ArchUnit rules, integration tests over MockMvc
make test         # or: ./gradlew test
```

Once running locally:

- API base: <http://localhost:8080/api/v1>
- Swagger UI: <http://localhost:8080/swagger-ui.html>
- Health: <http://localhost:8080/actuator/health>

Run `make help` to see every target.

## Playing a duel locally

Two ordinary accounts are all it takes — there is no bot. With the app running on `localhost:8080`:

```bash
API=http://localhost:8080/api/v1

# 1. Two players register; the response carries a bearer token straight away.
ALICE=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"correct-horse-battery"}' | jq -r .token)
BOB=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"bob","password":"correct-horse-battery"}' | jq -r .token)

# 2. Alice challenges Bob. She gets her redacted view: her hand, counts for everything hidden, the trump.
DUEL=$(curl -s -X POST $API/duels -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"opponentUsername":"bob"}')
ID=$(jq -r .duelId <<<"$DUEL"); echo "$DUEL" | jq .

# 3. Bob listens for Alice's moves instead of polling.
curl -N -H "Authorization: Bearer $BOB" -H 'Accept: text/event-stream' $API/duels/$ID/events &

# 4. Whoever `.attacker` names leads. Moves are ATTACK, DEFEND, TAKE and END_ATTACK.
curl -s -X POST $API/duels/$ID/moves -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"type":"ATTACK","card":{"rank":"SEVEN","suit":"CLUBS"}}' | jq .phase
curl -s -X POST $API/duels/$ID/moves -H "Authorization: Bearer $BOB" -H 'Content-Type: application/json' \
  -d '{"type":"DEFEND","attackCard":{"rank":"SEVEN","suit":"CLUBS"},"card":{"rank":"TEN","suit":"CLUBS"}}' | jq .phase
curl -s -X POST $API/duels/$ID/moves -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' \
  -d '{"type":"END_ATTACK"}' | jq .attacker
```

An illegal move — out of turn, a card you do not hold, a defence that does not beat the attack — is a `400`
problem detail with a machine-readable `reason`, and the duel is left exactly as it was. When the duel ends both
players receive a `DUEL_FINISHED` event, a `duel_result` row is written, both players' progress is updated and
the Redis key is deleted; the duel then answers `404`.

`scripts/smoke.sh` plays a whole duel this way against a running stack, so it doubles as executable documentation.

### API surface

| Endpoint                           | Purpose                                                             |
|------------------------------------|---------------------------------------------------------------------|
| `POST /api/v1/auth/register`       | Create an account; returns id, username, token                       |
| `POST /api/v1/auth/login`          | Exchange credentials for a token (one generic `401` on failure)       |
| `GET  /api/v1/me`                  | Own profile, progress (duels played/won, currency) and collection     |
| `GET  /api/v1/me/duels`            | Own finished duels, newest first (opponent, WON/LOST/DRAW, reason)    |
| `GET  /api/v1/catalog/themes`      | Active deck themes                                                    |
| `GET  /api/v1/catalog/themes/{code}` | One theme's rank+suit → skin mapping, with rarity and multiplier   |
| `GET  /api/v1/collection`          | What the caller owns, and the unlock rule for everything they do not  |
| `POST /api/v1/skins/{code}/unlock` | Run the unlock rule for a skin (`400` unmet, `409` owned, `501` purchase) |
| `POST /api/v1/themes/{code}/unlock`| Same, for a whole theme                                               |
| `POST /api/v1/duels`               | Challenge another player by username                                  |
| `GET  /api/v1/duels/{id}`          | The caller's redacted view                                            |
| `POST /api/v1/duels/{id}/moves`    | Submit a move; the engine re-validates it against the stored state    |
| `GET  /api/v1/duels/{id}/events`   | Server-sent events for the duel (keepalive comment every 20s)         |

Everything except registration, login, health and the API docs requires a bearer token. Participation in a duel
is checked in the service layer, so a non-participant gets `403` on every duel endpoint regardless of transport.

## Project layout

A modular monolith. Each business module owns its own web layer; modules talk service-to-service and ArchUnit
(`src/test/java/cardwar/architecture`) fails the build if one reaches into another's repository or domain.

```
src/main/java/cardwar
├── engine/         # Pure Durak rules: DuelState in, new state + events out. No Spring, no Jakarta, no I/O.
├── catalog/        # Deck themes, card skins, rarities, multipliers — all rows in Postgres, cached with Caffeine.
├── session/        # Duel lifecycle: GameStateStore (Redis impl), authorization, redaction, SSE fan-out.
├── account/        # Registration, login, player progress.
├── monetization/   # Entitlements, unlock rules and the pluggable EntitlementGrantSource implementations.
├── security/       # JWT issue/verify, PrincipalResolver/PlayerIdentity, filter chain, rate limiting.
├── api/            # Cross-cutting web concerns: ProblemDetail handler, the /me aggregate.
├── config/         # Beans: engine, cache, Redis listener container, OpenAPI.
└── exception/      # ApplicationException and its HTTP-mapped subclasses.
```

Design notes worth knowing before changing things:

- **The engine is a pure function.** `DurakEngine.apply(state, player, command)` returns a new state plus events
  and never mutates its input. Randomness enters only through `RandomGenerator`; production uses `SecureRandom`,
  tests pass a seed. `java.util.Random` is banned by an ArchUnit rule.
- **Redis holds in-progress state, Postgres holds only results.** Every write refreshes the key's TTL, so an
  abandoned duel expires on its own. Writes are a Lua compare-and-set on the state version; a lost race is a `409`
  and the client re-reads rather than retrying blindly.
- **Redaction is built into the view.** `DuelView.of(state, viewer)` is the only way state leaves the service, and
  it reduces the opponent's hand and the talon to counts. Engine events carry only public facts.
- **Skins are data.** Adding a skin or moving a character to a different rank and suit is an `INSERT`/`UPDATE`.
  The seed ships a neutral `CLASSIC` deck and a `VANGUARD` deck of invented characters — no real people.
- **Unlocks are rules plus grant sources.** `unlock_rule` rows say how a target is acquired (free, progress
  threshold, currency price, purchase); one `EntitlementGrantSource` per rule type decides. Real-money purchase
  exists as a seam that reports `501` and moves no money.

## Configuration

Configuration lives in `src/main/resources/application.yml` and reads from environment variables. `.env.example`
documents every variable the stack needs with non-production placeholders; copy it to `.env` (gitignored).

| Variable          | Default (local)                            | Purpose                                              |
|-------------------|--------------------------------------------|------------------------------------------------------|
| `DB_URL`          | `jdbc:postgresql://localhost:5432/cardwar` | JDBC URL                                             |
| `DB_USERNAME`     | `cardwar`                                  | DB user                                              |
| `DB_PASSWORD`     | `cardwar`                                  | DB password                                          |
| `REDIS_HOST`      | `localhost`                                | Redis host (`redis` inside compose)                  |
| `REDIS_PASSWORD`  | *(empty)*                                  | Redis password; required by the compose `redis`      |
| `JWT_SECRET`      | *(none)*                                   | Base64 HS256 key, ≥ 32 bytes. **Required in prod.**  |
| `JWT_TTL`         | `2h`                                       | Token lifetime                                       |
| `DUEL_STATE_TTL`  | `2h`                                       | How long an idle duel survives in Redis              |

Outside the `prod` profile a missing `JWT_SECRET` yields an ephemeral random key (tokens die with the process).
In `prod` the application refuses to start without one. Generate a real one with `openssl rand -base64 48`.

### Profiles

- **`dev`** (`application-dev.yml`) — verbose logging and easy SQL tracing.
- **`prod`** (`application-prod.yml`) — Hikari timeouts and leak detection, trimmed actuator exposure, `INFO`
  logging. The compose `app` service sets `SPRING_PROFILES_ACTIVE=prod`.

Logging never includes hands, cards, credentials, hashes or tokens at `INFO` or above; players and duels appear by
identifier only.

## Running the full stack

Four services, one command, no cloud dependency. nginx is the only service that publishes ports.

```bash
cp .env.example .env     # set real POSTGRES_PASSWORD, REDIS_PASSWORD and JWT_SECRET
make certs               # self-signed cert into nginx/certs/ (gitignored)
make up                  # build the image, start db + redis + app + nginx, wait for health
make ps                  # all four should be "healthy"
make logs                # tail everything
make smoke               # two players play a duel end to end through nginx over HTTPS
make down                # stop; volumes are kept
```

- `make up` starts from `docker-compose.yml` alone. `docker-compose.override.yml` — which publishes Postgres and
  Redis on `127.0.0.1` for `bootRun` — is never loaded on a server.
- `app` starts only after `db` and `redis` report healthy, and is healthy only when its readiness probe passes.
- `redis` requires a password and runs with `appendonly yes` on a named volume, so in-progress duels survive a
  restart (subject to their TTL).
- **Real certificate:** mount it at `/etc/nginx/certs/fullchain.pem` and `privkey.pem` — with certbot that is
  `/etc/letsencrypt/live/<domain>:/etc/nginx/certs:ro` in place of the `./nginx/certs` bind in `docker-compose.yml`.
- `make migrate` runs the Liquibase migrations (and therefore the seed changesets) once without starting the web
  server. Migrations also run automatically on every application start.

## Testing

```bash
./gradlew test                    # everything
./gradlew test --tests 'cardwar.engine.*'          # engine only: fast, no Docker
./gradlew test --tests 'cardwar.integration.*'     # MockMvc over a real Postgres + Redis
```

- **Engine tests** drive rules with hand-built states (`Duels` builder) and seeded full games that assert card
  conservation after every move.
- **Integration tests** extend `AbstractIntegrationTest` and go through the real filter chain with bearer tokens
  (`ApiDriver`), including a complete two-player duel and live SSE delivery.
- **ArchUnit** enforces the module boundaries described above; `archRule.failOnEmptyShould=true` so a mistyped
  package cannot make a rule pass vacuously.
- **Coverage** — JaCoCo gates the build at 85% instruction coverage (`build.gradle.kts`).
- **Dependency scan** — `./gradlew dependencyCheckAnalyze` is report-only and deliberately not part of `build`.

## CI & dependency updates

- **GitHub Actions** (`.github/workflows/ci.yml`): a `build` job (format check, tests, coverage) and a separate
  report-only `dependency-scan` job.
- **Renovate** (`renovate.json`) opens grouped dependency-update PRs.

## Out of scope for now

Telegram bot / Mini App, WebSocket transport, real payments, AI opponent, leaderboards, matchmaking beyond a
direct challenge, admin UI. The seams for the first three exist (`PrincipalResolver`, the Redis event channel,
`EntitlementGrantSource`); nothing else is pre-built.

## License

[MIT](LICENSE)
