# Deployment Stack

## Purpose

The deployment stack is a single-command Docker Compose deployment for a bare VPS: the application, Postgres, Redis and nginx with healthchecks, persistent volumes, TLS termination at the edge, environment-based configuration and operational make targets, so the whole system can be brought up, updated and inspected without hand-wiring services.

## Requirements

### Requirement: Single-command stack
The full stack — application, Postgres, Redis and nginx — SHALL start on a bare VPS from a single command after copying `.env.example` to `.env`. The stack MUST NOT depend on any managed cloud service or cloud-provider SDK.

#### Scenario: Fresh machine bring-up
- **WHEN** an operator clones the repository on a machine with Docker installed, copies `.env.example` to `.env` and runs the documented bring-up command
- **THEN** all four services start and the API is reachable through nginx over HTTPS

#### Scenario: No cloud-provider coupling
- **WHEN** the compose file and application configuration are inspected
- **THEN** they reference no managed cloud service and no cloud-provider SDK

### Requirement: Application image
The application SHALL be built as a multi-stage container image that compiles with the project's build tool and runs on a slim JRE base image as a non-root user.

#### Scenario: Image runs as non-root
- **WHEN** the application container starts
- **THEN** its process runs as a non-root user

#### Scenario: Runtime image excludes build tooling
- **WHEN** the runtime image is inspected
- **THEN** it contains a JRE and the application layers, not a JDK or the build tool

### Requirement: Postgres service
The stack SHALL run Postgres with a named volume so data survives container recreation, credentials supplied from environment variables, and a readiness healthcheck.

#### Scenario: Data survives a restart
- **WHEN** the stack is stopped and started again without removing volumes
- **THEN** previously written accounts, catalog rows and duel results are still present

#### Scenario: Healthcheck reports readiness
- **WHEN** the database container is starting
- **THEN** its healthcheck reports unhealthy until the server accepts connections, then healthy

### Requirement: Redis service
The stack SHALL run Redis with a password supplied from an environment variable, on-disk persistence enabled, a named volume, and a healthcheck. Redis MUST NOT be reachable without authentication, and MUST NOT be published to the public network.

#### Scenario: Password required
- **WHEN** a client connects to Redis without credentials
- **THEN** commands are refused

#### Scenario: In-progress duels survive a restart
- **WHEN** the stack is restarted without removing volumes while duels are in progress
- **THEN** those duels are still readable and playable, subject to their remaining TTL

#### Scenario: Healthcheck reports readiness
- **WHEN** the Redis container is running and authenticated ping succeeds
- **THEN** its healthcheck reports healthy

### Requirement: Reverse proxy
The stack SHALL run nginx as the public entry point, terminating TLS and forwarding to the application over the internal network. A self-signed certificate SHALL be usable for local and initial deployment, and the configuration SHALL document where a real certificate is plugged in.

#### Scenario: Application not directly exposed
- **WHEN** the compose port mappings are inspected
- **THEN** only the reverse proxy publishes ports to the host

#### Scenario: Server-sent events pass through
- **WHEN** a client opens an event stream through the proxy
- **THEN** events are delivered as they are produced, without response buffering or premature timeout

#### Scenario: Real certificate hook documented
- **WHEN** an operator prepares a production deployment
- **THEN** the configuration states exactly where to mount a real certificate and key

### Requirement: Mini App served on the same origin
The nginx image SHALL be built with the Mini App client baked in and SHALL serve it at `/app/` on the same origin as `/api`, with a fallback to the client shell for unknown paths under `/app/`, `index.html` never cached and content-hashed assets cached long-term. Responses under `/app/` SHALL carry a Content-Security-Policy that permits Telegram's SDK script and framing by Telegram web clients, and connections only to the same origin.

#### Scenario: Client shell served
- **WHEN** a client requests `/app/` or any path below it through nginx
- **THEN** nginx answers 200 with the client shell and a CSP containing `frame-ancestors` for Telegram

### Requirement: Application healthcheck and startup ordering
The application service SHALL declare a healthcheck against its readiness endpoint and SHALL start only after Postgres and Redis report healthy.

#### Scenario: Ordered startup
- **WHEN** the stack starts from cold
- **THEN** the application container starts only after the database and Redis healthchecks pass

#### Scenario: Readiness reflected in the healthcheck
- **WHEN** the application has started but is not yet ready to serve traffic
- **THEN** its healthcheck reports unhealthy

### Requirement: Schema managed by migrations
The database schema SHALL be created and evolved exclusively by versioned migrations executed at application startup. Automatic schema generation from the object model MUST NOT be used to create or alter tables.

#### Scenario: Fresh database migrated on startup
- **WHEN** the application starts against an empty database
- **THEN** migrations create the full schema and seed the catalog before the application accepts traffic

#### Scenario: Schema drift detected
- **WHEN** the object model no longer matches the migrated schema
- **THEN** startup fails validation rather than silently altering tables

### Requirement: Operational commands
The repository SHALL provide make targets covering at least starting the stack, stopping it, tailing logs, running migrations, seeding data, and generating a local self-signed certificate.

#### Scenario: Operator brings up and inspects the stack
- **WHEN** an operator runs the documented targets
- **THEN** the stack starts, logs are tailed, migrations run and seed data is applied without hand-written Docker commands

#### Scenario: Certificate generation
- **WHEN** an operator runs the certificate target on a fresh checkout
- **THEN** a self-signed certificate and key are produced in the location the proxy expects, and they are not tracked by git
