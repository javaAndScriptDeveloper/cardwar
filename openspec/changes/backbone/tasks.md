## 1. Rebrand and build setup

- [x] 1.1 Move `src/main/java/com/example/company/**` and `src/test/java/com/example/company/**` to `cardwar/**`, rewriting every package declaration and import
- [x] 1.2 Delete the template's `client/` Feign example (`ExampleApiClient`, `ExampleApiClientFallback`), `config/FeignConfig`, `config/JobLoggingAspect` and `InstancioExampleTest`; drop the now-unused OpenFeign and circuit-breaker dependencies from `build.gradle.kts`
- [x] 1.3 Set `rootProject.name = "cardwar"` in `settings.gradle.kts` and `group = "cardwar"` in `build.gradle.kts`; update the jacoco `coverageExclusions` paths to `cardwar/**`
- [x] 1.4 Add dependencies: `spring-boot-starter-security`, `spring-boot-starter-data-redis`, `io.jsonwebtoken` jjwt api/impl/jackson, `com.bucket4j:bucket4j-core`; test: `com.redis:testcontainers-redis`
- [x] 1.5 Add the `org.owasp.dependencycheck` plugin configured as a standalone task, explicitly not wired into `check`
- [x] 1.6 Create the empty module package tree: `engine`, `catalog`, `session`, `account`, `monetization`, `security`, `api`, `config`, with `controller/service/repository/domain` subpackages for the four business modules
- [x] 1.7 Move `GlobalExceptionHandler` from `config/` to `api/`; add handlers for illegal-move, authorization, conflict and not-found application errors mapping to 400/403/409/404 problem details
- [x] 1.8 Rename `spring.application.name` and the `logging.level` package keys to `cardwar` in `application.yml`, `application-dev.yml` and `application-prod.yml`; change `management.endpoint.health.show-details` from `always` to `when-authorized` in the base config
- [x] 1.9 Verify `./gradlew spotlessApply build` is green before writing any domain code

## 2. Architecture rules

- [x] 2.1 Add an ArchUnit rule that no class in `cardwar.engine` references `org.springframework..`, `jakarta..`, or any sibling `cardwar` module package
- [x] 2.2 Add an ArchUnit rule banning `java.util.Random` in `cardwar.engine` and `cardwar.security`
- [x] 2.3 Add ArchUnit slice rules: the four business modules must be cycle-free, and no module may reference another module's `repository` or `domain` package
- [x] 2.4 Add an ArchUnit rule that no class outside `cardwar.session.store` references Redis client types
- [x] 2.5 Flip `archRule.failOnEmptyShould` to `true` in `src/test/resources/archunit.properties` and confirm all rules still pass

## 3. Engine core

- [x] 3.1 Add `Rank` (SIX..ACE with comparable order), `Suit`, and the `Card` record in `cardwar.engine`
- [x] 3.2 Add `Deck` with 36-card construction and `shuffled(RandomGenerator)`; add a `SecureRandom`-backed factory as the only production entry point
- [x] 3.3 Add the `DuelState` record — duel id, both player ids, hands, talon, trump card and suit, table as attack/defence pairs, discard, attacker id, phase, version — with immutable copy helpers
- [x] 3.4 Add sealed `GameCommand` (`Attack`, `Defend`, `TakeCards`, `EndAttack`) and sealed `GameEvent` (`DuelStarted`, `CardPlayed`, `CardDefended`, `CardsTaken`, `RoundEnded`, `CardsDealt`, `DuelFinished`) hierarchies
- [x] 3.5 Add `IllegalMoveException` carrying a machine-readable reason enum
- [x] 3.6 Implement `DurakRules.beats(attackCard, defenceCard, trumpSuit)` covering same-suit-higher, trump-beats-non-trump and higher-trump-beats-trump
- [x] 3.7 Implement duel start: deal six each, reveal the trump as the talon's bottom card, select the first attacker by lowest trump then lowest card overall
- [x] 3.8 Implement `Attack` handling: turn ownership, card in hand, throw-in rank must already be on the table, six-card round cap and defender-hand-size cap
- [x] 3.9 Implement `Defend` handling: turn ownership, card in hand, target attack card exists and is undefended, beat legality
- [x] 3.10 Implement `TakeCards`: all table cards to the defender's hand, attacker retains the attack next round
- [x] 3.11 Implement `EndAttack`: rejected while any attack card is undefended; otherwise table to discard and the defender becomes attacker
- [x] 3.12 Implement between-round refill to six, attacker first then defender, stopping when the talon is exhausted
- [x] 3.13 Implement end conditions: talon empty and a player out, winner/loser assignment, the simultaneous-empty draw, and rejection of any command in the finished phase
- [x] 3.14 Implement `DurakEngine.apply(state, playerId, command)` returning new state plus events, incrementing the version, with no mutation of the input state

## 4. Engine tests

- [x] 4.1 Deck tests: 36 distinct cards, no rank below six, seeded shuffle reproducibility
- [x] 4.2 `DurakRules.beats` tests covering every combination of same suit, different suit, trump and non-trump
- [x] 4.3 Duel start tests: hand and talon sizes, trump selection, first attacker by lowest trump, and the no-trumps-in-hand fallback
- [x] 4.4 Attack tests: legal opening attack, defender attacking, card not in hand, non-matching throw-in rank, six-card cap, defender-hand-size cap
- [x] 4.5 Defence tests: same-suit higher, trump over non-trump, lower same-suit rejected, non-trump over trump rejected, already-defended target rejected
- [x] 4.6 Round resolution tests: take moves all table cards and keeps the attacker; end-attack discards and swaps roles; end-attack rejected with an undefended card
- [x] 4.7 Refill tests: attacker-first order, partial talon, no draw above six, trump card drawn last
- [x] 4.8 End-condition tests: winner and loser, draw, and every command rejected after the duel finishes
- [x] 4.9 Full-game tests driving seeded duels to completion and asserting invariants hold at every step (card conservation, no duplicates, hand sizes)

## 5. Database schema

- [x] 5.1 Add the `player` and `player_progress` changesets (uuid primary keys, unique username, BCrypt hash column, counters and currency balance)
- [x] 5.2 Add the `rarity`, `deck_theme` and `card_skin` changesets, including `UNIQUE(theme_id, rank, suit)`, a unique skin code, the nullable multiplier override and the active flag
- [x] 5.3 Add the `unlock_rule` and `entitlement` changesets, including the per-player-per-target uniqueness constraint
- [x] 5.4 Add the `duel_result` changeset (both participants, nullable winner and loser, draw marker, timestamps, move count, end reason)
- [x] 5.5 Add a seed changeset for rarities, the 36-card classic theme, and one example theme of fictional placeholder characters with their unlock rules
- [x] 5.6 Verify a fresh database migrates and that Hibernate `ddl-auto: validate` passes against every entity

## 6. Catalog module

- [x] 6.1 Add `Rarity`, `DeckTheme` and `CardSkin` entities and their Spring Data repositories
- [x] 6.2 Implement `CatalogService`: list themes, resolve a theme's rank-and-suit-to-skin mapping, compute effective multipliers, exclude inactive skins, and resolve the default theme
- [x] 6.3 Add a `catalog` cache name to `spring.cache.cache-names` and annotate the catalog reads
- [x] 6.4 Add `CatalogController` exposing the theme list and a theme's mapping, returning 404 as a problem detail for an unknown code
- [x] 6.5 Test multiplier resolution (override vs rarity default), inactive-skin exclusion, theme uniqueness, and that the seeded classic theme has all 36 cards

## 7. Account module and authentication

- [x] 7.1 Add the `Player` and `PlayerProgress` entities and repositories
- [x] 7.2 Add `PlayerIdentity` and `PrincipalResolver` in `cardwar.security`, deliberately free of any provider-specific type
- [x] 7.3 Implement `JwtService`: HS256 sign and verify, subject is the player id, secret and TTL from configuration, failing startup in the production profile when the secret is absent
- [x] 7.4 Implement `AccountService`: registration with BCrypt hashing and duplicate-username rejection, and credential authentication that does not distinguish unknown username from wrong password
- [x] 7.5 Add `AuthController` (`POST /api/v1/auth/register`, `POST /api/v1/auth/login`) with bean-validated request DTOs that never echo the password back
- [x] 7.6 Add `MeController` (`GET /api/v1/me`) returning the authenticated player's profile, progress and collection
- [x] 7.7 Test registration, duplicate username, invalid input, successful login, wrong password, unknown username, and that no plaintext password is persisted

## 8. Security wiring

- [x] 8.1 Add `SecurityConfig`: stateless session policy, CSRF disabled, public paths for auth, health and API docs, everything else authenticated by default
- [x] 8.2 Add `JwtAuthenticationFilter` resolving a `PlayerIdentity` and populating the security context, rejecting missing, tampered and expired tokens with 401
- [x] 8.3 Add `RateLimitFilter` using bucket4j, keyed on the principal and falling back to the client address, with a stricter bucket for `/api/v1/auth/**`, returning 429 when exhausted
- [x] 8.4 Audit every log statement so hands, cards, credentials, hashes and tokens never appear at INFO or above
- [x] 8.5 Test unauthenticated 401, tampered token 401, expired token 401, that a forged player id in a request body is ignored, and that login is throttled to 429

## 9. Session module

- [x] 9.1 Define the `GameStateStore` interface (`find`, `save` with expected version, `delete`) in `cardwar.session.store`
- [x] 9.2 Implement `RedisGameStateStore`: JSON serialization of `DuelState`, key `cardwar:duel:{id}`, TTL from configuration refreshed on every write, and a Lua compare-and-set on the version raising a conflict on mismatch
- [x] 9.3 Add `RedisConfig` (connection factory, serializers, listener container) and the Redis properties in `application.yml`
- [x] 9.4 Add the `DuelResult` entity, repository, and the transactional completion path that writes the result, bumps both players' progress and deletes the state-store key
- [x] 9.5 Implement `DuelService.create`: validate both participants exist and differ, start the duel through the engine, persist the initial state
- [x] 9.6 Implement `DuelService.applyCommand`: participation check, load state, delegate to the engine, save with the expected version, publish events, and run the completion path when the duel finishes
- [x] 9.7 Implement `DuelService.viewFor`: participation check plus redaction of the opponent's hand and the talon to counts
- [x] 9.8 Add `DuelEventPublisher` publishing engine events to `cardwar:duel:{id}:events`, kept independent of any client transport
- [x] 9.9 Add the SSE subscriber: a Redis listener fanning out to per-duel, per-player `SseEmitter`s with the same redaction applied to every pushed event
- [x] 9.10 Add `DuelController`: `POST /api/v1/duels`, `GET /api/v1/duels/{id}`, `POST /api/v1/duels/{id}/moves`, `GET /api/v1/duels/{id}/events`, with bean-validated move payloads
- [x] 9.11 Test store behaviour against a Redis container: TTL set on create, TTL refreshed on move, and concurrent saves where exactly one wins and the other conflicts

## 10. Monetization module

- [x] 10.1 Add the `Entitlement` and `UnlockRule` entities and repositories
- [x] 10.2 Define the `EntitlementGrantSource` interface keyed by rule type
- [x] 10.3 Implement `FreeGrantSource`, `ProgressGrantSource` (duels-won threshold) and `CurrencyGrantSource` (balance check plus deduction in the same transaction as the grant)
- [x] 10.4 Implement `PurchaseGrantSource` as an explicit not-available-yet implementation that makes no external call
- [x] 10.5 Implement `EntitlementService`: ownership lookup honouring expiry, duplicate-grant rejection, rule resolution and grant-source dispatch
- [x] 10.6 Add `EntitlementController`: `POST /api/v1/skins/{code}/unlock` and a collection endpoint reporting owned targets and the unlock path for locked ones
- [x] 10.7 Test free unlock, progress met and unmet, currency sufficient and insufficient with balance unchanged on failure, duplicate grant rejected, expired entitlement not counted as ownership, and purchase reported unavailable

## 11. Integration tests

- [x] 11.1 Add a Redis container to `TestcontainersConfiguration` alongside the existing Postgres `@ServiceConnection`
- [x] 11.2 Add a full two-player duel walkthrough over MockMvc: register both, log both in, create the duel, play to completion, then assert the result row exists and the Redis key is gone
- [x] 11.3 Add authorization integration tests: a third player gets 403 reading, moving and subscribing; a participant never sees the opponent's cards in either the REST view or a pushed event
- [x] 11.4 Add illegal-move integration tests returning 400 problem details with the state unchanged: out of turn, card not in hand, and an unbeatable defence
- [x] 11.5 Add an SSE test asserting that a move by one player is delivered to the other player's open stream
- [x] 11.6 Raise the jacoco coverage floor off `0.0` to a level the suite actually meets and confirm `./gradlew build` passes

## 12. Infrastructure

- [x] 12.1 Add the `redis` service to `docker-compose.yml`: password from `REDIS_PASSWORD`, `appendonly yes`, a named volume, an authenticated-ping healthcheck, and no published host port
- [x] 12.2 Add the `nginx` service as the only service publishing ports, terminating TLS and proxying to `app`, with SSE-safe settings (proxy buffering off, long read timeout) in `nginx/nginx.conf`
- [x] 12.3 Install `curl` in the Dockerfile runtime stage and add the `app` readiness healthcheck plus `depends_on: service_healthy` for both `db` and `redis`; pass the Redis and JWT environment through to `app`
- [x] 12.4 Add `REDIS_PASSWORD`, `JWT_SECRET`, `JWT_TTL` and `DUEL_STATE_TTL` to `.env.example` with placeholder values; gitignore `nginx/certs/*` while keeping the directory tracked
- [x] 12.5 Extend the `Makefile` with `logs`, `migrate`, `seed` and `certs` targets, retarget `image` to `cardwar`, and make `up`/`down` cover the full four-service stack
- [x] 12.6 Add a dependency-scan job to `.github/workflows/ci.yml`, separate from the build job
- [x] 12.7 Add `scripts/smoke.sh` driving the two-player REST flow end to end against a running stack

## 13. Verification

- [x] 13.1 Run `./gradlew spotlessApply && ./gradlew build` — unit and integration tests green, ArchUnit rules pass, coverage gate passes
- [ ] 13.2 Run `./gradlew dependencyCheckAnalyze` and confirm it produces a report without gating the build
- [x] 13.3 Run `cp .env.example .env && make certs && make up` and confirm all four services reach healthy and the API answers through nginx over HTTPS
- [x] 13.4 Run `scripts/smoke.sh` against the live stack: two players, live SSE delivery, duel played to completion, result row present in Postgres and the duel key gone from Redis
- [x] 13.5 Confirm an in-progress duel's Redis key reports a positive TTL, and manually verify the negative paths — 401 unauthenticated, 403 non-participant, 400 illegal move, 429 login flood
- [x] 13.6 Update `README.md` for Cardwar: what it is, the module layout, how to run the stack, and how to play a duel locally
