.DEFAULT_GOAL := help
.PHONY: help run dev test build format check db-up db-down up down logs ps migrate seed certs certs-prod image smoke clean

# Prefer .env if present, otherwise fall back to the committed example.
ENV_FILE := $(if $(wildcard .env),.env,.env.example)
# Expose the env file's variables to recipes (certs-prod needs DOMAIN).
include $(ENV_FILE)
export

# The full stack is always started from the base file alone: docker-compose.override.yml publishes the datastores
# on loopback for local `bootRun` and must never be loaded on a server.
COMPOSE_FULL := docker compose -f docker-compose.yml --env-file $(ENV_FILE) --profile full

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# --- local development -------------------------------------------------------------------------------------

run: ## Run the app on the host (auto-starts Postgres + Redis via docker-compose)
	./gradlew bootRun

dev: ## Run with throwaway Testcontainers Postgres + Redis (no docker-compose needed)
	./gradlew bootTestRun

test: ## Run unit + integration tests (needs Docker for Testcontainers)
	./gradlew test

build: ## Full build incl. tests, ArchUnit, coverage gate and formatting check
	./gradlew build

format: ## Auto-format the codebase
	./gradlew spotlessApply

check: ## Verify formatting without changing files
	./gradlew spotlessCheck

db-up: ## Start the local Postgres and Redis in the background (loopback ports)
	docker compose --env-file $(ENV_FILE) up -d db redis

db-down: ## Stop the local Postgres and Redis
	docker compose down

# --- the full stack: db + redis + app + nginx ----------------------------------------------------------------

up: ## Build & run the full stack (db, redis, app, nginx) with $(ENV_FILE)
	$(COMPOSE_FULL) up --build -d

down: ## Stop the full stack (volumes are kept; add `-v` by hand to wipe data)
	$(COMPOSE_FULL) down

logs: ## Tail logs of the full stack
	$(COMPOSE_FULL) logs -f --tail=200

ps: ## Show service status and health
	$(COMPOSE_FULL) ps

migrate: ## Run the Liquibase migrations once against the compose database, without starting the web server
	$(COMPOSE_FULL) run --rm --no-deps --entrypoint java app \
		-jar application.jar --spring.main.web-application-type=none --cardwar.events.enabled=false

seed: ## Apply seed data (catalog, rules). Seed data is a Liquibase changeset, so this is `migrate`.
	$(MAKE) migrate

certs: ## Generate a self-signed certificate for nginx into nginx/certs (gitignored)
	@mkdir -p nginx/certs
	@if [ -f nginx/certs/privkey.pem ]; then echo "nginx/certs already has a key; delete it to regenerate"; exit 0; fi
	openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
		-keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
		-subj "/CN=$(or $(CERT_CN),localhost)" \
		-addext "subjectAltName=DNS:$(or $(CERT_CN),localhost),DNS:localhost,IP:127.0.0.1"
	@echo "Self-signed certificate written to nginx/certs/. For production, mount a real one at the same paths."

certs-prod: ## Obtain/renew a Let's Encrypt certificate for $(DOMAIN) via the nginx webroot and install it for nginx
	@test -n "$(DOMAIN)" || { echo "DOMAIN is not set (put it in .env)"; exit 1; }
	certbot certonly --webroot -w $(CURDIR)/nginx/acme -d $(DOMAIN) --non-interactive --agree-tos \
		--register-unsafely-without-email --keep-until-expiring
	install -m 600 /etc/letsencrypt/live/$(DOMAIN)/fullchain.pem nginx/certs/fullchain.pem
	install -m 600 /etc/letsencrypt/live/$(DOMAIN)/privkey.pem nginx/certs/privkey.pem
	-$(COMPOSE_FULL) exec -T nginx nginx -s reload

image: ## Build the OCI image (tag: cardwar)
	docker build -t cardwar .

smoke: ## Drive a two-player duel end to end against the running stack (BASE_URL, default https://localhost)
	scripts/smoke.sh

clean: ## Remove build artifacts
	./gradlew clean
