# Testing DiffBro in Docker

Runs the **real Electron app** (main process, preload, renderer, IPC — the
works) inside a Linux container on a virtual display, streamed to your
browser via noVNC. No NSIS/DMG build, no installer, nothing touches the
host beyond Docker itself.

## Usage

```bash
make dev                 # or: npm run docker:up / docker compose up --build
```

Then open **http://localhost:6080/vnc.html** and click _Connect_.

The container's entrypoint already runs `electron-vite dev` — do **not** start
a second one with `docker compose exec … npm run dev`; the two instances fight
over the Vite port and the X display. Use `make restart` to relaunch the app
and `make shell` for a shell (its `DISPLAY` is preset to `:99`, so `xdotool`
and `scrot` work straight away).

- The source tree is bind-mounted into the container and runs under
  `electron-vite dev`, so edits on the host hot-reload inside the container.
- Sample files to diff live in `tests/data/` → `/app/tests/data` in the
  container (use _File → Open Left/Right_ or the toolbar slots; drag & drop
  from the host doesn't cross the VNC boundary).
- Stop with `Ctrl+C` or `npm run docker:down`.

## Packaging

`make package-win` does _not_ use the dev container. It runs the separate
`builder` service, pinned to `linux/amd64` and built from the Dockerfile's
`packaging` stage, because electron-builder's bundled `makensis` is x86_64-only
and its NSIS steps shell out to wine (64- **and** 32-bit — the uninstaller is
built by running the fresh installer under wine). On Apple Silicon the whole
thing runs emulated, so expect a few minutes. Output lands in `dist/` on the
host; `latest.yml` and `.blockmap` are auto-update metadata electron-builder
always emits and are unused by this app.

`make package-mac` is the one target that runs on the host instead: a DMG needs
macOS's `hdiutil`, so it cannot be cross-built from the container and requires
Node installed locally.

## Notes

- `node_modules` and `build` are container-local named volumes so the Linux
  Electron binaries never mix with the Windows/macOS ones on the host.
  After changing dependencies in `package.json`, refresh them with
  `make rebuild` (`docker compose down -v && docker compose up --build`).
- Because `build` is one of those volumes, a `npm run build` on the HOST never
  reaches the container. `make e2e` is safe — `test:e2e` builds first — but
  running Playwright directly (`docker compose exec node npx playwright test …`)
  tests whatever the container built last. Rebuild inside it first:
  `docker compose exec node npx electron-vite build`.
- The container runs Chromium with `--no-sandbox` (required as root in a
  container) and software rendering. That's fine for functional testing but
  is **not** representative for performance measurements.
- Chromium logs a few `Failed to connect to the bus … /run/dbus/system_bus_socket`
  lines at startup. They are harmless — the container has a session bus but no
  system bus. `Missing X server or $DISPLAY`, on the other hand, means Electron
  was started outside the entrypoint's environment.
- The offline kill switch is active in the container exactly as on the
  desktop; only the local Vite dev server is allowed through (dev mode).
- Some keyboard shortcuts (Ctrl+1/Ctrl+2 = browser tab switch, Ctrl+T = new
  tab) are captured by _your_ browser before they reach noVNC — use the
  app's File menu for those actions when testing through the browser.
- What this does _not_ test: native window chrome, OS file dialogs of the
  host platform, host drag & drop, installer behavior. Those still need a
  real `npm run dev` / packaged build on the target OS.
