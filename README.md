# Cardwar

A two-player **Durak** (throw-in / *podkidnoy*, 36 cards, no transferring) service with a data-driven card-skin
catalog and a freemium ownership model. Headless by design: the game engine knows nothing about HTTP, Telegram or
databases. Two adapters drive it: the REST API, and a Telegram Mini App (`client/`) built on that API.

## Stack

| Concern             | Choice                                                                 |
|---------------------|------------------------------------------------------------------------|
| Language / runtime  | Java 25, auto-provisioned via Gradle toolchains                        |
| Framework           | Spring Boot 4.1 (Spring Framework 7), Spring Security, Spring Data     |
| Build               | Gradle 9.6 (Kotlin DSL)                                                |
| Finished results    | PostgreSQL 17, schema owned by Liquibase, Hibernate `validate` only    |
| In-progress duels   | Redis 7 (per-duel key with TTL, Lua compare-and-set, pub/sub events)  |
| Auth                | Username/password or Telegram initData, BCrypt, HS256 JWT, bucket4j    |
| Live updates        | Server-sent events fed from the Redis event channel                    |
| API docs            | springdoc-openapi (Swagger UI at `/swagger-ui.html`)                   |
| Errors              | RFC 9457 `ProblemDetail` responses                                     |
| Testing             | JUnit 5, Testcontainers (Postgres + Redis), ArchUnit, JaCoCo gate      |
| Deployment          | Docker Compose: `db` + `redis` + `app` + `nginx` (TLS termination)     |
| Client              | Vite + TypeScript + Preact Mini App, served by nginx at `/app/`        |
| Client testing      | Vitest + Testing Library; Playwright end-to-end against the stack     |

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
| `POST /api/v1/auth/telegram`       | Exchange Mini App `initData` for a token; creates the account once    |
| `GET  /api/v1/me`                  | Own profile, progress (duels played/won, currency) and collection     |
| `GET  /api/v1/me/duels`            | Own finished duels, newest first (opponent, WON/LOST/DRAW, reason, stake, net coins) |
| `GET  /api/v1/wallet`              | Balance and today's bonus (available, amount, streak day, next time)  |
| `POST /api/v1/wallet/daily-bonus`  | Claim today's bonus (`409 BONUS_ALREADY_CLAIMED` the second time)      |
| `GET  /api/v1/wallet/transactions` | The caller's latest 50 coin movements                                  |
| `GET  /api/v1/catalog/themes`      | Active deck themes                                                    |
| `GET  /api/v1/catalog/themes/{code}` | One theme's rank+suit → skin mapping, with rarity and multiplier   |
| `GET  /api/v1/collection`          | What the caller owns, and the unlock rule for everything they do not  |
| `POST /api/v1/skins/{code}/unlock` | Run the unlock rule for a skin (`400` unmet, `409` owned, `501` purchase) |
| `POST /api/v1/themes/{code}/unlock`| Same, for a whole theme                                               |
| `POST /api/v1/duels`               | Challenge another player by username                                  |
| `POST /api/v1/duels/invites`       | Create an invite (optional `{stake}`: 0/100/500/1000/5000) to share for 15 min |
| `GET  /api/v1/duels/invites/{id}`  | Invite status for its creator; names the duel once accepted           |
| `POST /api/v1/duels/invites/{id}/accept` | Accept, escrow both stakes, start the duel (`400` own/`INSUFFICIENT_COINS`, `404`, `409`) |
| `POST /api/v1/matchmaking`         | Quick match at a stake table: pairs at once or queues for 60 s        |
| `GET  /api/v1/matchmaking`         | WAITING / MATCHED (duel id, once) / EXPIRED, or `204` when not queued  |
| `DELETE /api/v1/matchmaking`       | Leave the queue                                                        |
| `GET  /api/v1/friends`             | Everybody you played, with the record between you                      |
| `POST /api/v1/friends/{id}/challenge` | Challenge a friend at a stake; the bot DMs them a Join button        |
| `GET  /api/v1/challenges`          | Challenges waiting for you                                             |
| `POST /api/v1/duels/invites/{id}/decline` | Decline a challenge addressed to you                           |
| `GET  /api/v1/shop`                | Cosmetics with ownership/equipped state, and Stars coin packs          |
| `POST /api/v1/shop/items/{code}/buy` | Buy for coins (`400 INSUFFICIENT_COINS`, `409 ALREADY_OWNED`)        |
| `POST /api/v1/shop/items/{code}/equip` | Equip an owned item                                                |
| `GET  /api/v1/me/loadout`          | What you have equipped, and your emotes                                |
| `POST /api/v1/shop/stars/invoice`  | Telegram Stars invoice link for a coin pack                            |
| `POST /api/v1/duels/{id}/emotes`   | Throw an owned emote at the table (one per 3 s)                        |
| `GET  /api/v1/duels/active`        | The caller's in-progress duels, card-free, for resuming after a restart |
| `GET  /api/v1/duels/{id}`          | The caller's redacted view                                            |
| `POST /api/v1/duels/{id}/moves`    | Submit a move; the engine re-validates it against the stored state    |
| `GET  /api/v1/duels/{id}/events`   | Server-sent events for the duel (keepalive comment every 20s)         |

Everything except registration, the two logins, health and the API docs requires a bearer token. Participation in a duel
is checked in the service layer, so a non-participant gets `403` on every duel endpoint regardless of transport.

## Telegram Mini App demo

Two Telegram accounts open the Mini App from the bot, one invites the other, and they play a duel to a result.

### How it fits together

- **Sign-in.** Telegram signs `window.Telegram.WebApp.initData` with the bot token. The client posts it to
  `POST /api/v1/auth/telegram`; `TelegramInitDataVerifier` checks the HMAC exactly as Telegram documents it and
  rejects `auth_date` older than an hour, and `TelegramSignInService` (the second `PrincipalResolver`) finds or
  creates a password-less account (`tg_<telegram id>`). The answer is the same JWT a password login returns, so every
  later request, filter and service is unchanged. The token lives in memory only.
- **Matchmaking is an invite.** A creates an invite (Redis, 15 minutes) and shares
  `https://t.me/<bot>?start=<inviteId>`. That opens the bot chat; the bot (webhook `POST /api/v1/telegram/webhook`)
  answers `/start <inviteId>` with a **Join the duel** button that opens `/app/?invite=<inviteId>`, and B's app
  accepts it on launch. This needs no BotFather Main Mini App. A cannot subscribe to a duel that does not exist
  yet, so A's app polls the invite every 2 seconds until it names the duel. Accepting is an atomic Redis claim: one
  acceptor, ever. A player has one pending invite at a time: Telegram reloads the app whenever A switches to a chat
  to send it, and on reload the app asks `GET /duels/invites/pending` and shows the same code again.
- **Resuming.** On launch the app asks `GET /duels/active` and goes straight back to a running duel.
- **Live updates.** The client reads the duel's server-sent events with `fetch` (EventSource cannot send the bearer
  header). Each event, and each reconnect, is only a nudge to re-fetch `GET /duels/{id}`; REST is the truth. A
  finished duel is deleted at once, so the player who did not make the last move gets a 404 and reads the result
  from `GET /me/duels` instead.
- **Game logic stays on the server.** `src/game/selectors.ts` mirrors the engine only to enable buttons; a rejected
  move comes back as a 400 whose `reason` the client turns into a toast.
- **Skins later.** The classic deck is static SVG under `client/public/cards/classic/`, named exactly like the
  catalog seed's `image_ref`. `cardImageUrl` in `client/src/ui/CardImage.tsx` is the one function that turns a card
  into a URL; catalog-driven skins replace that function.

### Set up the bot (BotFather, once)

1. `/newbot` in [@BotFather](https://t.me/BotFather). Keep the token: it is `TELEGRAM_BOT_TOKEN`, and the username
   (without `@`) is `TELEGRAM_BOT_USERNAME`.
2. Menu button: in BotFather, *Bot Settings → Menu Button*, URL `https://<your domain>/app/`. The same can be done
   with the token alone:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setChatMenuButton" -H 'Content-Type: application/json' \
     -d '{"menu_button":{"type":"web_app","text":"Play","web_app":{"url":"https://<your domain>/app/"}}}'
   ```
3. Webhook, so the bot answers `/start` (a greeting with a Play button, or a Join button for an invite link). The
   secret is HMAC-SHA256 of `cardwar-webhook` keyed by the token, so there is nothing new to store:
   ```bash
   SECRET=$(printf 'cardwar-webhook' | openssl dgst -sha256 -hmac "$TELEGRAM_BOT_TOKEN" -r | cut -d' ' -f1)
   curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -H 'Content-Type: application/json' \
     -d "{\"url\":\"https://<your domain>/api/v1/telegram/webhook\",\"secret_token\":\"$SECRET\",\"allowed_updates\":[\"message\",\"pre_checkout_query\"]}"
   ```
4. Optional: a named app from `/newapp` (set `TELEGRAM_APP_NAME` to its short name) makes invite links
   `t.me/<bot>/<app>?startapp=<invite>`, which open the app directly without the bot chat in between.

### Deploy

Telegram only opens Mini Apps over a valid public certificate, so this needs a server with a domain.

```bash
git clone <this repo> /opt/cardwar && cd /opt/cardwar
cp .env.example .env    # real POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET; TELEGRAM_BOT_TOKEN and
                        # TELEGRAM_BOT_USERNAME from BotFather; DOMAIN=<your domain>
make certs              # self-signed pair so nginx can start the first time
make up                 # builds the app image and the nginx image with the client inside (several minutes)
make certs-prod         # real Let's Encrypt certificate through the nginx ACME webroot, then reload
BASE_URL=https://<your domain> scripts/smoke.sh    # from anywhere: API, Mini App shell, a full duel
```

Renew weekly with `make certs-prod` from cron. Updating later is `git pull && make up`.

### Play

1. Both players open the bot and tap **Play** (the menu button). The app signs them in with Telegram.
2. A taps **Invite a friend**, then **Share invite** and picks B's chat. (Or **Copy code** and sends it.)
3. B taps the link, presses **Start** in the bot chat, then **Join the duel** (or pastes the code under *Join*).
   The duel opens for both.
4. The attacker taps a card to attack or throw in; the defender taps the card to beat (only needed when several are
   open) and then a card from hand. **Take** and **End attack** do what they say. The line under the table always
   says whose move it is.
5. When the talon is empty and a hand runs out, both see *You won*, *You lost* or *Draw*.

### Develop without Telegram

The same build runs in a plain browser: with no initData the app shows a **dev shim** login instead (any new name
is registered on the spot), and `?invite=<code>` in the URL plays the role of `start_param`.

```bash
make dev                         # backend on :8080 with throwaway Postgres + Redis (Testcontainers)
cd client && npm ci && npm run dev    # http://localhost:5173/app/ ; /api is proxied to :8080
```

Open two browser windows (one private) to play both sides. Client checks: `npm run lint && npm test && npm run build`.

### Client structure

The UI is Ukrainian; code and docs are English. `src/i18n` holds every string (`uk.json`, read through `t(key)`;
a test fails on unused or missing keys). `src/router` is a hash router (`#/`, `#/friends`, `#/shop`, `#/profile`,
`#/settings`, `#/duel/:id`) wired to Telegram's BackButton. `src/state` keeps device settings in a signal backed by
localStorage. `src/motion` wraps the Web Animations API in named effects (glide, beat, take, shake, pulse…) that honour
reduced-motion; `src/audio` owns one AudioContext and the default sound pack (`npm run gen:sounds` regenerates the
placeholders). `src/game/diff.ts` turns consecutive duel views into table events, which drive animations, sounds and
haptics now and the content rule engine later. `src/ui/kit` is the component kit on the tokens in `tokens.css`;
screens live in `src/ui/{lobby,friends,shop,profile,settings}` under `Shell`. Tests and the Playwright run read
`data-testid` / `data-*` attributes, never copy.

### End-to-end test

`make e2e` (or `cd client && npx playwright install chromium && npm run e2e`) drives two browsers through the
running stack (`make up`, default `https://localhost`, or `E2E_BASE_URL`): sign in with the shim, invite, accept
through the deep link, an illegal tap that must be refused, then a whole duel decided from the DOM, ending with both
result screens. Run it before `make smoke`: the smoke test's login flood throttles sign-ins from your address for a
minute. CI runs both in the `client-e2e` job.

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
├── wallet/         # Coins: append-only ledger, wallet balance, daily bonus, stake escrow and settlement.
├── metrics/        # GameMetrics: the business counters behind the Grafana business dashboard.
├── security/       # JWT issue/verify, PrincipalResolver/PlayerIdentity, filter chain, rate limiting.
├── bot/            # Telegram bot webhook: answers /start with a Play button, or a Join button for an invite.
├── api/            # Cross-cutting web concerns: ProblemDetail handler, the /me aggregate.
├── config/         # Beans: engine, cache, Redis listener container, OpenAPI.
└── exception/      # ApplicationException and its HTTP-mapped subclasses.

client/              # The Telegram Mini App (Vite + TypeScript + Preact). Game logic stays on the server.
├── src/api/         # Typed /api/v1 calls, ApiError, the fetch-based duel event stream.
├── src/auth/        # Session: initData -> JWT inside Telegram, password dev shim outside it. Memory only.
├── src/game/        # Card model, selectors mirroring the engine (to enable controls only), reason texts.
├── src/telegram/    # The one wrapper around window.Telegram.WebApp, and invite links.
├── src/ui/          # App, Home (lobby), DuelScreen + Table, CardImage.
├── public/cards/    # The classic deck, generated by scripts/gen-cards.mjs.
└── e2e/             # Playwright: two browsers play a duel through nginx.
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
| `DUEL_INVITE_TTL` | `15m`                                      | How long a shared invite can be accepted             |
| `TELEGRAM_BOT_TOKEN` | *(none)*                                | BotFather token; verifies initData. **Required in prod.** |
| `TELEGRAM_INIT_DATA_MAX_AGE` | `1h`                            | Oldest initData accepted for sign-in                 |
| `TELEGRAM_BOT_USERNAME` | *(empty)*                            | nginx build arg: bot named in invite links           |
| `TELEGRAM_MINI_APP_URL` | `https://localhost/app/`             | What the bot's buttons open; compose sets it from `DOMAIN` |
| `TELEGRAM_BOT_API_URL` | `https://api.telegram.org`            | Bot API base the bot replies through                 |
| `TELEGRAM_APP_NAME` | *(empty)*                                | nginx build arg: BotFather named app, if any         |

Outside the `prod` profile a missing `JWT_SECRET` yields an ephemeral random key (tokens die with the process), and a
missing `TELEGRAM_BOT_TOKEN` makes every Telegram sign-in fail. In `prod` the application refuses to start without
either. Generate a real one with `openssl rand -base64 48`.

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

- **GitHub Actions** (`.github/workflows/ci.yml`): a `build` job (format check, tests, coverage), a `client` job
  (lint, unit tests, build), a `client-e2e` job (the compose stack, Playwright, then the smoke test) and a separate
  report-only `dependency-scan` job.
- **Renovate** (`renovate.json`) opens grouped dependency-update PRs.

## Out of scope for now

Skins in the Mini App, currency earning, WebSocket transport, real payments, AI opponent, leaderboards, chat,
matchmaking beyond invites and direct challenges, admin UI. The seams for several exist (`cardImageUrl` and the
catalog, the Redis event channel, `EntitlementGrantSource`); nothing else is pre-built.

## License

[MIT](LICENSE)
