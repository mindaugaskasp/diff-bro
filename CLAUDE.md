# DiffBro — project instructions

Offline-only desktop diff viewer. Electron + electron-vite + Vue 3 + Pinia +
Monaco. Roadmap lives in `DEVELOPMENT_PLAN.md` — keep its checkboxes current.

## Commands

- `npm run dev` — run natively. `make test-env` / `npm run docker:up` — full
  app in Docker with noVNC at http://localhost:6080/vnc.html (loopback only).
- `npm run check` — lint + tests. **Run it before declaring any task done.**
- `npm test` / `npm run lint` / `npm run format` — individually.
- `npm run build` — bundles to `build/` (NOT electron-builder's default;
  `buildResources` is `resources/`). Installers: `build:win` / `build:mac`.

## Hard security rules (non-negotiable)

1. **Offline guarantee.** The app never makes network requests. Never weaken
   the session-level kill switch, the CSP, `sandbox: true`,
   `contextIsolation`, the deny-all permission handler, or the
   `will-navigate` block in `src/main/index.js`. No telemetry, no
   auto-update, no CDN assets — ever.
2. **New dependencies need a network audit.** Before adding any package:
   confirm it makes no runtime network calls, then run `npm audit`. Prefer
   zero new production dependencies.
3. **Renderer never touches Node or Electron.** All fs, dialog, and crypto
   work lives in the main process behind small, validated IPC handlers.
   The renderer talks only to `window.api` (preload). ESLint enforces this
   (`no-restricted-imports`) — do not disable the rule.
4. **Keys never cross the IPC boundary.** Vault crypto goes through
   `vault:encrypt`/`vault:decrypt`; identity private keys stay behind
   `safeStorage` in userData. Never add an IPC handler that returns key
   material to the renderer.
5. **Crypto invariants** (see `src/main/sealing.js` and `vaultCrypt.js`):
   sealed shares are sign-then-encrypt, bound to one recipient in both the
   signature (payload ‖ recipient-fp) and the GCM AAD; saved-diff metadata
   is authenticated as AAD; expiry is capped at 24 h and enforced on both
   the sealing and opening side. Any change to these files requires
   updating `tests/` in the same change AND re-verifying the share
   roundtrip in the Docker env.
6. **Untrusted input is hostile.** Files chosen for import (`.diffbro`,
   `.diffbrokey`) get size caps, shape validation, and recomputed
   fingerprints before use. Keep it that way for any new import surface.
7. **No injection sinks.** `v-html`, `eval`, `new Function`, `innerHTML`
   are banned (ESLint-enforced). User-influenced strings render only
   through Vue text interpolation.

## Coding standards

- Prettier (`.prettierrc.json`: no semicolons, single quotes, width 100)
  and ESLint (`eslint.config.mjs`) are the style authority — run
  `npm run format` rather than hand-formatting, and never commit code that
  fails `npm run check`.
- Vue SFCs use `<script setup>`, scoped styles, and CSS variables from
  `style.css` for every color — hardcoded colors break the light/dark
  theme. New UI must be checked in both themes.
- Comments explain *why* or state invariants; never narrate what the next
  line does. Match the density and tone of the surrounding file.
- New file formats go through the adapter registry
  (`src/renderer/src/adapters/`) returning a `{ kind, ... }` comparable —
  never special-case a format inside `DiffViewer`.
- Keyboard shortcuts: add to BOTH the hidden application menu
  (`src/main/index.js`) and the custom `MenuBar.vue`, use `CmdOrCtrl` in
  accelerators and the `MOD` constant (`keys.js`) in labels.

## Testing rules

- Vitest, tests in `tests/*.test.js`, jsdom environment (`tests/setup.js`
  provides localStorage — Node's built-in one is broken in workers).
- Every behavior change in `src/main/sealing.js`, `vaultCrypt.js`, the
  Pinia stores, or the adapters needs a test in the same change. Crypto
  code additionally needs negative tests (tamper, wrong key, expiry).
- Keep pure logic out of Electron-importing files so it stays unit-testable:
  `share.js`/`index.js` are thin glue; `sealing.js`/`vaultCrypt.js` are the
  testable cores. Follow that split for new main-process logic.
- UI-level changes are verified in the Docker test env (screenshots via
  `xdotool`/`scrot` inside the container; keyboard via `xdotool`, not the
  noVNC page — see `docker/README.md`).

## Workflow

- **Never `git commit` unless explicitly asked.**
- Temp/test artifacts (generated key files, `.diffbro` files) must be
  cleaned up from `testdata/` after verification; only `config-v1.json`
  and `config-v2.json` belong there.
- After dependency changes, the Docker env needs `make rebuild`
  (volume-shadowed `node_modules`). Prefer `make install` for adding or
  updating dependencies — it writes `package-lock.json` with the
  container's npm, which is pinned to the same major as the host's
  (npm 11). npm majors disagree about optional/platform packages in the
  lock, and a lock written by one fails `npm ci` under the other; keep
  host npm and the Dockerfile's `npm install -g npm@11` in step.
- `@emnapi/core` / `@emnapi/runtime` are pinned in devDependencies only to
  work around npm dropping them from the lock (they are transitive
  optionals of vitest's wasm toolchain) — do not remove them just because
  nothing imports them.
- Update `README.md` (including the mermaid diagram) and
  `DEVELOPMENT_PLAN.md` when architecture or feature status changes.
