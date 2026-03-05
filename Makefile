.DEFAULT_GOAL := help
HARNESS_ENV := ./docker/.env
HARNESS_COMPOSE := ./docker/docker-compose.yml

.PHONY: \
	help \
	repo.lint repo.test repo.build repo.format \
	api.dev api.lint api.test api.test-run api.migrate api.db-reset api.build \
	web.dev web.lint web.test web.test-run web.build \
	docs.dev docs.lint docs.test docs.build docs.format-check \
	workspace.dev workspace.test workspace.test-run workspace.coverage workspace.format-check \
	harness.setup harness.up harness.down harness.reset harness.logs harness.ps

help:
	@echo "MosBot Root Makefile"
	@echo ""
	@echo "Repository:"
	@echo "  make repo.lint          Run root lint workflow"
	@echo "  make repo.test          Run root test workflow"
	@echo "  make repo.build         Run root build workflow"
	@echo "  make repo.format        Run root format workflow"
	@echo ""
	@echo "API:"
	@echo "  make api.dev            Start API in dev mode"
	@echo "  make api.lint           Run API lint"
	@echo "  make api.test           Run API tests (watch)"
	@echo "  make api.test-run       Run API tests once"
	@echo "  make api.migrate        Run API migrations"
	@echo "  make api.db-reset       Reset API DB (destructive)"
	@echo "  make api.build          Build API production image"
	@echo ""
	@echo "Web:"
	@echo "  make web.dev            Start web dev server"
	@echo "  make web.lint           Run web lint"
	@echo "  make web.test           Run web tests (watch)"
	@echo "  make web.test-run       Run web tests once"
	@echo "  make web.build          Build web bundle"
	@echo ""
	@echo "Docs:"
	@echo "  make docs.dev           Start docs dev server"
	@echo "  make docs.lint          Run docs JS lint"
	@echo "  make docs.test          Run docs checks"
	@echo "  make docs.build         Build docs site"
	@echo "  make docs.format-check  Check docs formatting"
	@echo ""
	@echo "Workspace Server:"
	@echo "  make workspace.dev           Start workspace server"
	@echo "  make workspace.test          Run workspace tests (watch)"
	@echo "  make workspace.test-run      Run workspace tests once"
	@echo "  make workspace.coverage      Run workspace coverage"
	@echo "  make workspace.format-check  Check workspace formatting"
	@echo ""
	@echo "OpenClaw Harness (docker/docker-compose.yml):"
	@echo "  make harness.setup      First-time harness setup"
	@echo "  make harness.up         Start harness stack"
	@echo "  make harness.down       Stop harness stack"
	@echo "  make harness.reset      Reset harness state"
	@echo "  make harness.logs       Follow harness logs"
	@echo "  make harness.ps         Show harness status"

repo.lint:
	npm run lint

repo.test:
	npm run test

repo.build:
	npm run build

repo.format:
	npm run format

api.dev:
	npm run -w ./api dev

api.lint:
	npm run -w ./api lint

api.test:
	npm run -w ./api test

api.test-run:
	npm run -w ./api test:run

api.migrate:
	npm run -w ./api migrate

api.db-reset:
	@echo "WARNING: This will destroy all data in the local database."
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ]
	npm run -w ./api db:reset

api.build:
	docker build --target production -t mosbot-api:local ./api

web.dev:
	npm run -w ./web dev

web.lint:
	npm run -w ./web lint

web.test:
	npm run -w ./web test

web.test-run:
	npm run -w ./web test:run

web.build:
	npm run -w ./web build

docs.dev:
	npm run -w ./docs start

docs.lint:
	npm run -w ./docs lint:check

docs.test:
	npm run -w ./docs test:ci

docs.build:
	npm run -w ./docs build

docs.format-check:
	npm run -w ./docs format:check

workspace.dev:
	npm run -w ./workspace-server start

workspace.test:
	npm run -w ./workspace-server test

workspace.test-run:
	npm run -w ./workspace-server test:run

workspace.coverage:
	npm run -w ./workspace-server test:coverage

workspace.format-check:
	npm run -w ./workspace-server format:check

harness.setup:
	./docker/docker-setup.sh

harness.up:
	DOCKER_BUILDKIT=0 docker compose --env-file $(HARNESS_ENV) -f $(HARNESS_COMPOSE) up -d

harness.down:
	docker compose --env-file $(HARNESS_ENV) -f $(HARNESS_COMPOSE) down

harness.reset:
	./docker/docker-setup.sh reset

harness.logs:
	docker compose --env-file $(HARNESS_ENV) -f $(HARNESS_COMPOSE) logs -f

harness.ps:
	@docker compose --env-file $(HARNESS_ENV) -f $(HARNESS_COMPOSE) ps || true
