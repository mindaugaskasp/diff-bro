# DiffBro — developer shortcuts.
# On Windows, run via Git Bash / WSL (`make` from GnuWin32 or `choco install make`).

.PHONY: help test-env test-env-detached down rebuild logs shell clean dev build

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

test-env: ## Build + start the Docker test environment (noVNC at http://localhost:6080/vnc.html)
	docker compose up --build

test-env-detached: ## Same as test-env, but in the background (stop with `make down`)
	docker compose up --build -d
	@echo "DiffBro test environment running: http://localhost:6080/vnc.html"

down: ## Stop the test environment
	docker compose down

rebuild: ## Full refresh: drop containers AND volumes (needed after dependency changes), then start
	docker compose down -v
	docker compose up --build

logs: ## Tail container logs
	docker compose logs -f

shell: ## Open a shell inside the running container
	docker compose exec diffbro bash

clean: ## Remove containers, volumes, and the built image
	docker compose down -v --rmi local

dev: ## Run the app natively on this machine (needs npm install first)
	npm run dev

build: ## Bundle main/preload/renderer without packaging an installer
	npm run build

package-win: ## Build the Windows NSIS installer -> dist/
	npm run build:win

package-mac: ## Build the macOS DMG -> dist/ (must run on macOS)
	npm run build:mac
