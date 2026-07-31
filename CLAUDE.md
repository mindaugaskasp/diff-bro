# DiffBro — project instructions

Offline-only desktop diff viewer. Electron + electron-vite + Vue 3 + Pinia +
Monaco.

## Fixing a bug — read this before touching anything

**Non-negotiable, in this order, for every bug:**

1. **Write the test first and watch it FAIL.** Reproduce the bug in a test
   before changing a line of source. A regression test you have never seen fail
   proves nothing — it may assert something that was always true.
2. **Then fix the code.**
3. **Run the test again — it must now PASS.** Red → green is the evidence the
   fix works and the test guards it.
4. **If the test passed before the fix, the test is wrong, not the bug.**
   Rewrite it until it fails for the right reason, then start again at 2.

This covers UI defects too, not just pure logic: a visual or interaction bug
gets an **e2e** test (`e2e/`), driven the way a user hits it. When the defect is
a rendered property (colour, position, clipping, focus), assert the measurable
thing — a bounding box, a computed style, a contrast ratio — not a screenshot.

To prove an existing test really catches its bug, revert the fix, run it, see it
fail, restore the fix. That check is cheap and it is the only thing separating a
regression test from decoration.

## Commands

- `npm run dev` — run natively. `make test-env` / `npm run docker:up` — full
  app in Docker with noVNC at http://localhost:6080/vnc.html (loopback only).
- `npm run check` — lint + style-token guard + theme-depth guard + tests with
  coverage thresholds. **Run it before declaring any task done.**
- `npm test` / `npm run test:coverage` / `npm run lint` /
  `npm run check:styles` / `npm run check:themes` / `npm run format` —
  individually.
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
7. **Leaving the sandbox is fenced in main.** `shell.openExternal` is reachable
   only through `src/main/links.js`, which validates in the MAIN process and
   confirms with the user first: Claude links against the strict claude.ai
   allowlist, a URL snippet's link against an http(s)-only scheme check
   (`linkPolicy.js`). The scheme check is the fence — openExternal will
   otherwise open a local file, run a script handler, or launch another app.
   **URL snippets are local-only**: `_bundle` and `restoreBundle` drop them, so
   a link can never arrive in a shared bundle and be opened by one click.
8. **No injection sinks.** `v-html`, `eval`, `new Function`, `innerHTML`
   are banned (ESLint-enforced). User-influenced strings render only
   through Vue text interpolation.

## Coding standards

- Prettier (`.prettierrc.json`: no semicolons, single quotes, width 100)
  and ESLint (`eslint.config.mjs`) are the style authority — run
  `npm run format` rather than hand-formatting, and never commit code that
  fails `npm run check`.
- Vue SFCs use `<script setup>` and keep their CSS in a sibling file, linked
  as `<style scoped src="./styles/<Name>.css">`. A component is capped at
  **250 lines**, its template at 120 and its script at 100 (ESLint
  `max-lines` + `vue/max-lines-per-block`) — past that, split the markup into
  child components and move logic into `composables/` or `utils/`. Raising a
  cap is not the fix.
- Layering, ESLint-enforced: `utils/` is pure (no Vue, no stores, no
  components) so it stays unit-testable; `composables/` may use Vue and
  stores but never imports a component. `complexity`, `max-depth` and
  `max-params` (4 — pass an options object instead) apply everywhere, and
  `eslint-plugin-sonarjs` flags duplicated functions and cognitive load.
- The design system lives in `styles/`: `tokens.css` (colors + the
  radius/type/spacing/control-height scale) and `ui.css` (shared `.btn*`
  classes and the `.dialog*` layer). Buttons opt into `.btn` + a variant.
  `npm run check:styles` (scripts/check-style-tokens.mjs) fails the build on a
  hardcoded color, font-size or radius in `components/styles/` — add a token
  rather than a literal, or `/* token-exempt: reason */` when a literal is
  genuinely right. New UI must be checked in both themes.
- **Depth is a surface-role contract, not per-theme greys** — this is what keeps
  a theme from going flat (the light theme twice did). Four roles, recessed →
  raised: `--bg-canvas` (app ground) · `--bg`/`--bg-panel` (base surface / chrome)
  · `--bg-elevated` (raised band) · `--bg-raised` (a card that FLOATS on the
  canvas and casts a `--shadow-1/2/3`). A card reads the _role_, never a raw
  colour, so the same markup floats on every theme; the light theme opts into the
  floating-canvas inversion (tinted ground, white cards) purely by redefining
  `--bg-canvas`/`--bg-raised` under `:root[data-theme='light']`. Elevation is the
  `--shadow-*` scale in tokens.css (tinted per theme by `--shadow-rgb`) — reach
  for a level, don't hand-roll an `rgba()` drop. `npm run check:themes`
  (scripts/check-theme-depth.mjs) fails the build if any theme's text, surfaces,
  or border lose contrast — the floors are a ratchet, never lowered to green a run.
- **Alignment.** Any full-width horizontal strip (toolbar, file-slots row,
  section header, dialog header) is a _band_: it carries `.band` and vertically
  centres its content with flexbox. Never fake vertical alignment with top
  padding — it drifts the instant a font size or line-height changes (that is
  what twice broke the sidebar/file-input alignment). Bands that sit at the
  same vertical position across the sidebar/main divider share a height so
  their content lines up by construction: the file-slots row and EVERY sidebar
  section header add `.band-row` (height `--band-row`), so the headers all
  match each other and the first lines up with the file inputs. Controls
  sharing a band row must be
  equal-height flex-centred boxes.
- **Icons are SVG, never Unicode glyphs.** A symbol like ◈ / ⧉ / 🔒 tofus into a
  `[]` box on any font that lacks it, which kept happening. Every icon comes
  from `<AppIcon name="…" />`, whose geometry lives in `src/renderer/src/icons.js`
  (Feather/Lucide-style 24×24, sizes to 1em, inherits `currentColor`). Add a new
  icon by adding an entry to that map — never reach for a glyph character. Text
  glyphs used as _prose_ (⌘ in a shortcut label, ↔ in a diff name, the − on the
  deletions count) stay text; only standalone/interactive icons are SVG.
- Every modal is a `BaseDialog` (backdrop, header, `#actions` slot, Escape,
  focus trap). Its panel is BaseDialog's, so a dialog sizes itself with the
  `width` prop — scoped CSS cannot reach into a child. `:escape-closes="false"`
  for dialogs holding unsaved input. A new tool is an entry in the registry
  (`utils/tools.js`), a `Tool*.vue` panel, and a case in `TextToolDialog` /
  `QuickLookConvert` — never another dialog component. Every tool is a panel:
  there is no text-buffer/validate path left to fall back on.
- Objects that cross a boundary (props, composable returns) get a typedef in
  `src/renderer/src/types.js` and a JSDoc annotation; a prop typed `Object`
  documents nothing, so pair it with a `shaped(...)` validator from
  `utils/props.js`.
- **Prose comments are forbidden.** Code must explain itself through names and
  structure. A comment is allowed _only_ when the code's intent is genuinely
  ambiguous and cannot be made clear by better naming or refactoring — e.g. a
  non-obvious security invariant, a subtle gotcha, or a "why not the obvious
  thing" note. When one is truly warranted, keep it to a single terse line.
  Never narrate what the next line does, never restate the code in English, and
  never leave block/"wall" comments. When in doubt, delete the comment.
- **Sweep comments when a feature settles.** Comments written to reason through
  an in-progress implementation must not survive into the committed code. After
  finishing or changing a feature — and before committing — re-read every comment
  you touched and delete or shrink the ones the final code made redundant. A
  comment that described an earlier approach, restates the now-obvious, or that a
  rename would erase is stale by definition; only the genuinely-warranted terse
  "why" lines from the rule above stay.
- New file formats go through the adapter registry
  (`src/renderer/src/adapters/`) returning a `{ kind, ... }` comparable —
  never special-case a format inside `DiffViewer`.
- Keyboard shortcuts: add to BOTH the hidden application menu
  (`src/main/index.js`) and the custom `MenuBar.vue`, use `CmdOrCtrl` in
  accelerators and the `MOD` constant (`keys.js`) in labels.

## Testing rules

- Coverage has a floor (`vitest.config.mjs`: 88% statements / 78% branches /
  85% functions / 90% lines over the main-process cores, stores, utils and
  adapters) and `npm run check` enforces it. It is a ratchet: raise it as
  coverage rises, never lower it to make a red run green. Electron glue and
  `.vue` files are deliberately outside the measured set — they are verified
  in the Docker env.
- Vitest, jsdom environment (`tests/setup.js` provides localStorage — Node's
  built-in one is broken in workers). The tree under `tests/` mirrors `src/`:
  `tests/main/`, `tests/renderer/{stores,utils,adapters,composables}/`. A new
  test goes in the directory matching its subject's source path. Fixtures live
  in `tests/data/`.
- **Interaction bugs split two ways, and each has a home — this is how the
  recurring UI regressions get caught.** _Event logic_ (does a backdrop click
  close only when the press began on the backdrop? does Space commit a tag?
  does Escape leave the snippet editor open?) is pulled OUT of the `.vue` file
  into a `composables/` unit and unit-tested there — never left inline where
  nothing exercises it. The Mermaid-viewer resize-closes bug became
  `useBackdropClose` + `useBackdropClose.test.js`; follow that pattern for any
  new event guard. _Layout_ (alignment, sizing, overlap) can't be asserted in
  jsdom — verify it in the Docker env with screenshots, and encode the
  invariant as a shared class/token (see the band system) so it can't drift.
- Every behavior change in `src/main/sealing.js`, `vaultCrypt.js`, the
  Pinia stores, or the adapters needs a test in the same change. Crypto
  code additionally needs negative tests (tamper, wrong key, expiry).
- Keep pure logic out of Electron-importing files so it stays unit-testable:
  `share.js`/`index.js` are thin glue; `sealing.js`/`vaultCrypt.js` are the
  testable cores. Follow that split for new main-process logic.
- UI-level changes are verified in the Docker test env (screenshots via
  `xdotool`/`scrot` inside the container; keyboard via `xdotool`, not the
  noVNC page — see `docker/README.md`).
- **End-to-end** tests live in `e2e/` (Playwright driving the app's OWN
  Electron via `_electron` — no bundled browser, no network). `make e2e`
  builds then runs them INSIDE the up container (they need Xvfb :99, so they
  can't use the one-off `make check`/`test` container). Each test launches its
  own Electron against a throwaway `--user-data-dir`, so runs never touch the
  developer's real data and never fight the single-instance lock. Reach for E2E
  for a flow only a real launch exercises (preload/IPC round-trips, persistence
  across relaunch, OS-clipboard writes) — the kind of bug jsdom can't see. E2E
  is trusted-click, so `navigator.clipboard` writes there hit the deny-all
  permission handler and fail: clipboard writes go through `window.api.copyText`
  (main process, `src/main/clipboard.js`), never `navigator.clipboard`.

## Workflow

- **Never `git commit` unless explicitly asked.**
- Temp/test artifacts (generated key files, `.diffbro` files) must be
  cleaned up from `tests/data/` after verification; only `config-v1.json`
  and `config-v2.json` belong there.
- **Node 22.12+** (`.nvmrc`, `engines`, `node:22-bookworm-slim`, CI's
  `node-version: 22` — keep all four in step). On an older major `npm install`
  warns `EBADENGINE` for the app and for `@electron/rebuild` / `node-abi`,
  which genuinely require it. Fix the local Node (`nvm use`); never widen
  `engines` to silence it.
- Three deprecation warnings on install (`inflight`, `rimraf@2`, `glob@7`) are
  transitive dev-only dependencies of `electron-builder`, which is already at
  its latest — `npm audit` reports zero vulnerabilities and nothing we import
  reaches them. They are upstream's to fix: do NOT add `overrides` to force
  newer versions inside a build tool, which risks the installer builds for no
  security gain.
- After dependency changes, the Docker env needs `make rebuild`
  (volume-shadowed `node_modules`). Prefer `make install` for adding or
  updating dependencies — it writes `package-lock.json` with the
  container's npm, which is pinned to the same major as the host's
  (npm 11). npm majors disagree about optional/platform packages in the
  lock, and a lock written by one fails `npm ci` under the other; keep
  host npm and the Dockerfile's `npm install -g npm@11` in step.
- **Install scripts are gated** (npm 11): a package may only run one if it is
  listed in `allowScripts` in `package.json`. The approved six are all build
  toolchain (`electron`, `esbuild`, `fsevents`, `electron-winstaller`,
  `vue-demi`) — nothing that ships in the app. A new dependency that wants an
  install script is part of the network audit above: read what the script does,
  then `npm install-scripts approve <pkg>`. Every entry is **version-pinned**
  (`esbuild@0.25.12`, not `esbuild`) so a later version has to be re-reviewed
  rather than inheriting the approval. Pinning needs a `resolved` URL in BOTH
  `package-lock.json` and the hidden `node_modules/.package-lock.json` — npm
  reads the latter; if approve warns "approved by name (all versions)", run
  `npm install` to refresh the hidden lock and approve again. Never
  blanket-disable the gate (`--ignore-scripts=false` globally, or deleting the
  field) — it is the one check that stands between a compromised transitive
  package and arbitrary code on the build machine.
- `@emnapi/core` / `@emnapi/runtime` are pinned in devDependencies only to
  work around npm dropping them from the lock (they are transitive
  optionals of vitest's wasm toolchain) — do not remove them just because
  nothing imports them.
- Playwright drives the app's own Electron, never a bundled browser, so its
  ~400 MB browser download is skipped via `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
  (set in `docker/Dockerfile` before `npm ci`, and pass it when adding/updating
  deps). Never run `playwright install` — it would pull Chromium/Firefox/WebKit
  the suite doesn't use.
- Update `README.md` when architecture or feature status changes.
