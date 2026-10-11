# Cardwar — operating manual for Claude

Read this first, then `docs/poc-telegram-plan.md`, then the GitHub issues. Everything below is binding.

## What this is

Two-player Durak (36 cards, throw-in, no transfer) as a Spring Boot 4.1 / Java 25 service. Pure game engine,
Postgres for accounts/catalog/results, Redis for in-progress duels and events, JWT auth, SSE turn updates,
data-driven card skins, freemium entitlements. Deployed as a four-service compose stack behind nginx.

Current phase: **PoC — Telegram Mini App demo**. Two Telegram accounts open the Mini App, one invites the other,
they play a duel to a result with the default card design. Nothing else. Clean seams so later phases extend.

## Where the truth lives

| Need | Location |
|---|---|
| Task list for this phase | GitHub milestone `PoC: Telegram Mini App demo`, project https://github.com/users/javaAndScriptDeveloper/projects/3; local mirror `docs/poc-telegram-plan.md` |
| Behavioural contract | `openspec/specs/<capability>/spec.md` (7 capabilities, requirements + scenarios) |
| Why things are the way they are | `openspec/changes/archive/2026-09-28-backbone/{proposal,design}.md` |
| How to run / play / deploy | `README.md` |
| Module layout and boundaries | README "Project layout"; enforced by `src/test/java/cardwar/architecture/ArchitectureTest.java` |

OpenSpec change artifacts (`/opsx:*`) are **not** used for this phase. GitHub issues are the task source.
When an issue changes behaviour covered by a spec, update the main spec in `openspec/specs/` in the same commit.

## Working an issue (autonomous loop)

1. `gh issue list --milestone "PoC: Telegram Mini App demo" --state open` — pick the lowest-numbered issue whose
   "Depends on" issues are all closed. Backend and client tracks can run in parallel (see the plan doc).
2. `gh issue comment <n> --body "Starting. Plan: ..."` — two or three lines: approach and any decision you made
   that the issue left open. Decisions go in issue comments, never only in your head.
3. Work on `main` directly (solo project). Red test first, then code, then `./gradlew spotlessApply build`
   (backend) and `npm run lint && npm test && npm run build` in `client/` (client). Never claim green without
   reading the output.
4. Commit per logical step. Subject ≤72 chars, imperative. Body says **why**. Last commit for an issue includes
   `Closes #<n>`. End every message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
5. `git push origin main` after each closed issue so the issue closes and the project board moves.
6. If blocked by a decision only the owner can make: comment the options on the issue, pick the one that keeps
   the PoC smallest, state it, continue. Do not stop the night on a question.
7. Full regression before closing anything that touches `session` or `security`: `./gradlew build` and
   `scripts/smoke.sh` against `make up` (see README "Running the full stack").

Finish the whole milestone unless something is genuinely impossible; then leave a clear issue comment with
what was tried and what is needed.

## Hard rules (from the specs and the design)

- `cardwar.engine` depends on the JDK only. No Spring, Jakarta, Jackson, Lombok, no sibling module. Skins never
  touch the engine. `java.util.Random` banned in engine/security/session; use `SecureRandom` / `RandomGenerator`.
- Modules (`catalog`, `session`, `account`, `monetization`) talk service-to-service. Never import another module's
  `repository` or `domain`. Controllers call services only. ArchUnit fails the build otherwise.
- Redis client types only under `cardwar.session.store`, `cardwar.session.event`, `cardwar.config`.
- Authorization and hand redaction live in services (`DuelService`, `DuelView.of`), not controllers.
  A non-participant gets 403 for read, move and events. The opponent's hand and the talon are counts only.
- Postgres never holds in-progress hands. Redis key per duel, TTL refreshed on write, Lua compare-and-set;
  a lost race is a 409, never a retry.
- Logging: no hands, cards, passwords, hashes, tokens, initData at any level. Ids only.
- Secrets only from env (`.env.example` documents every variable). Prod refuses to start without `JWT_SECRET`
  (extend `ProductionSecretsCheck` for new ones such as `TELEGRAM_BOT_TOKEN`).
- Errors are RFC 9457 problem details via `GlobalExceptionHandler`. Unmet rule = 400, forbidden = 403,
  not found = 404, duplicate = 409, not implemented = 501.
- Schema only via new Liquibase changesets under `src/main/resources/db/changelog/changes/`; never edit an
  applied one. Hibernate stays `validate`.
- Public endpoints are listed explicitly in `SecurityConfig`; everything else is authenticated by default.
- `PrincipalResolver` → `PlayerIdentity` is the identity seam; `EntitlementGrantSource` the monetization seam;
  `GameStateStore` the storage seam; the Redis event channel the transport seam. Extend through them.

## Conventions

- Tests: engine = pure unit tests with the `Duels` builder; everything else = integration tests extending
  `AbstractIntegrationTest` (one shared context, Postgres + Redis via Testcontainers) driving the API through
  `ApiDriver` with bearer tokens. Different properties → own class with `@TestPropertySource` (boots a second
  context; keep rare). Entity no-arg constructors are protected; use `cardwar.catalog.domain.CatalogFixtures`.
- Coverage gate 85% instructions (`build.gradle.kts`). Keep it green; raise, never lower.
- Javadoc/comments explain **why**, briefly. No commented-out code, no TODOs without an issue number.
- Client (once it exists): TypeScript strict, ESLint + Prettier, Vitest; folders `src/api`, `src/auth`,
  `src/game`, `src/ui`, `src/telegram`. Game logic stays on the server; client selectors only enable controls.

## Commands

```
make help                 # all targets
./gradlew spotlessApply build          # format + compile + tests + ArchUnit + coverage gate
./gradlew test --tests 'cardwar.engine.*'   # fast, no Docker
./gradlew dependencyCheckAnalyze       # report-only CVE scan (slow first run; needs NVD_API_KEY ideally)
make up / make down / make ps / make logs   # full stack (db, redis, app, nginx) — nginx only publishes ports
make migrate              # one-shot Liquibase run, web server off
scripts/smoke.sh          # two-player duel end to end over HTTPS, plus 401/403/400/429 checks
gh issue list --milestone "PoC: Telegram Mini App demo"
gh project item-list 3 --owner javaAndScriptDeveloper
```

## Environment gotchas (this machine)

- Docker is required for tests. Another project already publishes host port 5432; `bootRun` with the compose
  override may collide. Use `make dev` (Testcontainers) or set `DB_PORT` in `.env`.
- Gradle: one build at a time per directory; a second invocation waits on the lock. Long tasks (image build,
  dependency scan, full suite) exceed 10 minutes sometimes — run them detached (`nohup setsid ... &`) and poll
  the log instead of wrapping them in `timeout`, which has corrupted the dependency-check H2 cache before.
- `gradle.properties` sets 2g heap; keep it.
- Every `CLAUDE.md` except this root one is gitignored: the claude-mem plugin drops auto-generated ones in
  every package. Ignore them. The plugin may also append a `<claude-mem-context>` block here; edit outside it.
- Parallel agents in worktrees have been created at the template commit `eff7d24` instead of `main`. If you
  spawn worktree agents, tell them to `git reset --hard main` first and to run only their own test classes.
- `gh` is logged in as `javaAndScriptDeveloper` with `repo`, `workflow`, `project` scopes.

## Production server (Hetzner CX22, provisioned 2026-10-12)

- Host `2.31.48.136`, `ssh root@2.31.48.136` (key auth from this machine). Ubuntu 26.04, 2 vCPU, 3.7 GB + 2 GB swap,
  Docker 29 + Compose v5, ufw allows 22/80/443 only.
- Domain `cardwar-gaming.duckdns.org` → that IP (and `www.`). Register the Mini App URL as
  `https://cardwar-gaming.duckdns.org/app/` in BotFather.
- Repo at `/opt/cardwar`, cloned over a read-only deploy key (`~/.ssh/cardwar_deploy`, registered on GitHub as
  "cardwar-vps"). Deploy = `ssh root@2.31.48.136 'cd /opt/cardwar && git pull && make up'`.
- Secrets live only in `/opt/cardwar/.env` (mode 600): Postgres/Redis passwords, `JWT_SECRET`, `DOMAIN`,
  `TELEGRAM_BOT_TOKEN`. Never copy them into the repo, logs, issues or chat. Read a variable with
  `grep '^NAME=' /opt/cardwar/.env` only when you need it.
- Certificates: a real Let's Encrypt certificate is installed (issued 2026-10-11, valid to 2027-01-09) by
  `make certs-prod`, which renews through the nginx ACME webroot and reloads nginx. `/etc/cron.weekly/cardwar-certs`
  runs it weekly; log at `/var/log/cardwar-certs.log`. Never run `make certs` (self-signed) on the server again;
  it would overwrite the real pair.
- Stack is deployed and healthy as of 2026-10-11 (`main` at 9404516). Image is built on the box (`make up`);
  about 8 minutes on 2 vCPU. Run it detached and tail `/opt/cardwar/deploy.log`. Verify with `make ps` (all four
  healthy) and `BASE_URL=https://cardwar-gaming.duckdns.org scripts/smoke.sh` from your machine (passes today).
- The repository is **public** (since 2026-10-12) so GitHub Actions minutes are free and unlimited; CI runs on
  every push to `main`. Never commit anything secret: secrets live only in `/opt/cardwar/.env` on the server and
  in the owner's local `.env`, both gitignored. Treat a red CI as a real signal again; check `gh run list`.

## Definition of done for the milestone

Two phones, two Telegram accounts, bot menu button opens the Mini App over a valid certificate, A invites B via
deep link, they play to WON/LOST/DRAW with the default cards, both see the result, `scripts/smoke.sh` and the
Playwright E2E are green in CI, README explains how to reproduce it.
