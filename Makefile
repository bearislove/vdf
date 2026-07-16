include .env

COMPOSE_PROD := docker compose -f docker-compose.prod.yml

.PHONY: install up down restart logs deps lint build shell deploy

install:
	docker compose up -d --build

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart app

logs:
	docker compose logs -f app

deps:
	docker compose run --rm app npm install

lint:
	docker compose exec app npm run lint

build:
	docker build --target production -t story-forge-v2:production .

deploy:
	@echo "==> Building production image"
	$(COMPOSE_PROD) build app
	@echo "==> Starting database"
	$(COMPOSE_PROD) up -d --wait db
	@echo "==> Applying database migrations"
	$(COMPOSE_PROD) run --rm --no-deps app npx prisma migrate deploy
	@echo "==> Starting production application"
	$(COMPOSE_PROD) up -d --wait app
	@echo "==> Deployment ready"
	$(COMPOSE_PROD) ps

shell:
	docker compose exec app sh
