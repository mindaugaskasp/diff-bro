# DiffBro — project instructions

Offline-only desktop diff viewer. Electron + electron-vite + Vue 3 + Pinia +
Monaco.

The engineering standards this repo runs on — commands, the hard security
rules, coding standards, testing rules and workflow — live in
**[docs/standards.md](docs/standards.md)**. They apply to every change; the
file below is imported into context automatically.

@docs/standards.md

## Working here

- **Never `git commit` unless explicitly asked.**
- **Run `npm run check` before declaring any task done** — lint + style-token
  guard + theme-depth guard + tests against the coverage floors.
- Three standards get skipped most often, so they are restated here:
  - **A bug gets a failing test first.** Red → green, or the test guards
    nothing.
  - **The offline guarantee, the renderer/main split and the crypto
    invariants are non-negotiable.** See the hard security rules.
  - **A UI change is checked against all 14 themes** before it is proposed,
    not after it is built.
  - prose / overly verbose comments must be removed / trimmed before stating feature is done. Code must be self describing.

## Where each kind of test runs

- **Unit tests run natively.** `npm test`, or `npm run check` for the full gate.
- **Docker exists because E2E needs a virtual display.** `make e2e` builds and
  drives the suite inside the running container; `make up` starts it, noVNC at
  <http://localhost:6080/vnc.html> (loopback only). Anything else needing a live
  app — `make theme-sweep`, `make screenshots`, `scrot`/`xdotool` layout
  checks — runs there too.
- **On macOS, run E2E on the host instead.** Faster for a single spec, and the
  only way to run the macOS-gated ones:

  ```sh
  npm run build
  env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/<spec>
  ```

  - `env -u ELECTRON_RUN_AS_NODE` is **not optional** — the agent shell exports
    it and Electron then silently runs as plain Node. The tell is
    `electron --version` printing a Node version, or `Process failed to launch!`.
  - Add `E2E_WORKERS=1` for more than one spec: the display pool is X11-only, so
    a second worker off Linux throws rather than share the system clipboard.
  - Add `E2E_HIDDEN=1` to stop windows flashing across the screen: every window
    starts with `show: false`, Chromium still renders offscreen, so visibility
    and geometry assertions are unaffected. Leave it OFF for
    `quick-look-window-recovery.spec.mjs`, which manipulates real windows.

- **A spec that skips off macOS proves nothing.** `window-all-closed` quits the
  app on Linux, so "alive with no main window" is unreachable there and
  `e2e/quick-look-window-recovery.spec.mjs` guards itself with
  `test.skip(process.platform !== 'darwin', …)`. Verify those red→green by hand:
  `git stash push -- src/main/ && npm run build`, run, restore.
