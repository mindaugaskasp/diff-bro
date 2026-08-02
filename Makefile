# DiffBro — developer shortcuts.
# Everything runs in the Docker test environment: the container owns the Linux
# Electron binaries and the Xvfb/noVNC display. macOS/Windows hosts need no
# local Node install.
# On Windows, run via Git Bash / WSL (`make` from GnuWin32 or `choco install make`);
# the recipes need a POSIX shell, so plain cmd.exe/PowerShell will not do. Under
# Git Bash, interactive targets need a real TTY: `winpty make shell`.

SERVICE := node
VNC_URL := http://localhost:6080/vnc.html

# seed-local imports src/main/sealing.js so the demo keys are in the app's own
# format; package.json has no "type", so Node warns about re-parsing it as ESM.
SEED_NODE_FLAGS := --disable-warning=MODULE_TYPELESS_PACKAGE_JSON

# One-shot container for build/lint/test work: no display, no entrypoint.
RUN_NPM := docker compose run --rm --entrypoint npm $(SERVICE)

.PHONY: help install test-env test-env-detached up stop down restart rebuild logs shell \
        clean dev check test e2e lint build package-win package-linux package-mac audit-fix \
        brew-cask screenshots local-seed local-seed-clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

test-env: ## Build + start the Docker test environment (noVNC at http://localhost:6080/vnc.html)
	docker compose up --build

test-env-detached: up ## Same as test-env, but in the background (stop with `make stop`)

up: ## Start the test environment in the background
	docker compose up --build -d
	@echo "App test environment running: $(VNC_URL)"

# Unlike `down`, this keeps the containers around, so `make up` afterwards is
# a quick restart rather than a fresh create.
stop: ## Stop the containers without removing them
	docker compose stop

down: ## Stop and remove the containers (volumes are kept)
	docker compose down

restart: ## Restart the app container (picks up main-process changes cleanly)
	docker compose restart $(SERVICE)
	@echo "App restarted: $(VNC_URL)"

install: ## Install deps / update package-lock.json with the container's Linux npm
	$(RUN_NPM) install
	@echo ""
	@echo "package-lock.json updated on the host (Linux-complete)."
	@echo "Run 'make rebuild' to bake the dependencies into the image."

rebuild: ## Full refresh: drop containers AND volumes (needed after dependency changes), then start
	docker compose down -v
	docker compose up --build

logs: ## Tail container logs
	docker compose logs -f

shell: ## Open a shell inside the running container (DISPLAY is preset to :99)
	docker compose exec $(SERVICE) bash

clean: ## Remove containers, volumes, and the built images (incl. the packaging one)
	docker compose --profile packaging down -v --rmi local
	rm -rf dist

audit-fix: ## Run `npm audit fix` inside the container
	$(RUN_NPM) -- audit fix --force

# The entrypoint already runs `electron-vite dev` with HMR, so this starts the
# environment and follows its output rather than launching a second Electron —
# two instances fight over the Vite port and the X display.
dev: ## Start the app (or attach to the running one) and follow its output
	@docker compose up -d --build $(SERVICE)
	@echo ""
	@echo "============================================================"
	@echo "  App is running: $(VNC_URL)"
	@echo "  Ctrl-C stops following the logs; the app keeps running."
	@echo "  'make stop' stops it, 'make restart' restarts it."
	@echo "============================================================"
	@echo ""
	@docker compose logs -f $(SERVICE)

check: ## Lint + tests in the container (run before declaring a task done)
	$(RUN_NPM) -- run check

test: ## Run the test suite in the container
	$(RUN_NPM) -- test

# Unlike `check`/`test`, E2E needs the virtual display, so it runs INSIDE the
# up container (which owns Xvfb :99) rather than a one-off `run` container.
# `up` is a dependency so the display is guaranteed to be there first.
e2e: up ## Build + drive the app end-to-end with Playwright in the running container
	docker compose exec -T $(SERVICE) npm run test:e2e

lint: ## Run ESLint in the container
	$(RUN_NPM) -- run lint

build: ## Bundle main/preload/renderer without packaging an installer
	$(RUN_NPM) -- run build

# Runs in the amd64 `builder` service (see docker-compose.yml): electron-builder's
# bundled makensis is x86_64-only, so packaging from an arm64 container fails.
package-win: ## Build the Windows x64 NSIS installer -> dist/ via the container
	docker compose --profile packaging run --rm --build builder

# x64 via the same amd64 service, so the artifacts match what most Linux desktops
# run. For a native-arch build (arm64 on Apple Silicon) use the dev service:
#   docker compose run --rm --entrypoint npm node -- run build:linux
package-linux: ## Build the Linux x64 AppImage + .deb -> dist/ via the container
	docker compose --profile packaging run --rm --build builder run build:linux

# electron-builder cannot produce a mountable DMG from Linux or Windows (it
# needs macOS's hdiutil), so unlike every other target this one runs on the
# host and only on macOS.
package-mac: ## Build the macOS DMG -> dist/ (must run natively on macOS)
	@[ "$$(uname -s)" = "Darwin" ] || { \
		echo "error: DMG packaging requires macOS (hdiutil); this is $$(uname -s)."; \
		exit 1; }
	@command -v npm >/dev/null 2>&1 || { \
		echo "error: macOS packaging needs Node/npm on the host (e.g. 'brew install node@20')."; \
		exit 1; }
	@# The lockfile is written by npm 11 (see the Dockerfile and docs/standards.md); an
	@# install from a different major rewrites it and breaks `npm ci` in the
	@# container, so refuse before the damage rather than after.
	@[ "$$(npm -v | cut -d. -f1)" = "11" ] || { \
		echo "error: host npm is $$(npm -v), but package-lock.json is npm 11's."; \
		echo "       run 'npm install -g npm@11' first."; \
		exit 1; }
	@[ -x node_modules/.bin/electron-vite ] || { \
		echo "error: host dependencies are not installed (node_modules is empty)."; \
		echo "       the container's deps live in a named volume the host cannot see;"; \
		echo "       run 'npm install' here for the native build."; \
		exit 1; }
	npm run build:mac

# Regenerate the Homebrew cask (packaging/homebrew/diff-bro.rb) with the current tag version
brew-cask: ## Regenerate the Homebrew cask for the current (or VERSION=x.y.z) release
	node scripts/gen-homebrew-cask.mjs $(VERSION) $(if $(DMG),--dmg $(DMG),)

# Refreshes docs/screenshots (the README images) by driving the app's own
# Electron with Playwright (page.screenshot). Runs INSIDE the up container for the
# same reason as e2e: it needs the virtual display (Xvfb :99), and Playwright's
# _electron can't launch Electron 39 on the macOS host (that build rejects the
# --remote-debugging-port=0 flag Playwright passes; Linux Electron accepts it).
# Builds first, seeds a demo library, walks each state — no manual interaction.
# Images land on the host via the bind mount. SHOTS="name ..." for a subset.
screenshots: up ## Refresh README screenshots (auto-drives the app in the container). SHOTS="name ..." for a subset
	docker compose exec -T $(SERVICE) npm run build
	docker compose exec -T $(SERVICE) node scripts/recapture-screenshots.mjs $(SHOTS)

# The one target that runs on the HOST rather than in the container: it seeds
# YOUR install, whose vault key lives behind this machine's keychain. Quit Diff
# Bro first — a second launch just hands its argv to the running one.
#
# It merges: what you already had is kept, everything it writes is tagged
# "seed", and local-seed-clean removes exactly that. Files to open land in
# seed-files/ (gitignored; override with SEED_DIR=…).
#
# `env -u ELECTRON_RUN_AS_NODE` is not optional — an agent shell exports it, and
# Electron then silently runs as plain Node.
local-seed: ## Fill your local install with test data (host-only; quit the app first)
	@[ -x node_modules/.bin/electron-vite ] || { \
		echo "error: host dependencies are not installed — run 'npm install' here first."; \
		exit 1; }
	npm run build
	env -u ELECTRON_RUN_AS_NODE node $(SEED_NODE_FLAGS) scripts/seed-local.mjs

local-seed-clean: ## Remove everything local-seed added (host-only; quit the app first)
	env -u ELECTRON_RUN_AS_NODE node $(SEED_NODE_FLAGS) scripts/seed-local.mjs --clean
