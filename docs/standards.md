# Engineering standards

The rules this repo runs on. Most are enforced by `npm run check` — ESLint, the
style-token guard, the theme-depth guard and coverage floors — so a change that
breaks one fails the build instead of waiting for review. The rest are written
down because they were learned the expensive way.

DiffBro is an offline-only desktop diff viewer: Electron + electron-vite +
Vue 3 + Pinia + Monaco.

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

   **Emailing a diff does not break this, because the app does not send.** It
   seals the file, hands a `mailto:` to the OS, and stops; the user's own mail
   client does the sending. An SMTP client was specced and rejected for exactly
   this reason — see `specs/2026-08-04-email-sharing/plan.md`. Note the trap it
   would have sprung: `installNetworkKillSwitch` filters
   `session.defaultSession.webRequest`, which is **Chromium traffic only**, so a
   main-process `tls.connect` would be invisible to it. The guarantee holds
   because nothing in main opens a socket, not because anything stops it. Any
   future proposal to add one starts from there.

2. **New dependencies need a network audit.** Before adding any package:
   confirm it makes no runtime network calls, then run `npm audit`. Prefer
   zero new production dependencies. `yaml` (structure-aware comparison) passed
   this: zero runtime deps, no network/`eval`/`child_process` in its shipped
   code, no install scripts, clean audit. Parsing runs with `maxAliasCount` so
   an anchor bomb cannot expand.
3. **Renderer never touches Node or Electron.** All fs, dialog, and crypto
   work lives in the main process behind small, validated IPC handlers.
   The renderer talks only to `window.api` (preload). ESLint enforces this
   (`no-restricted-imports`) — do not disable the rule.
4. **Keys never cross the IPC boundary.** Vault crypto goes through
   `vault:encrypt`/`vault:decrypt`; identity private keys stay behind
   `safeStorage` in userData. Never add an IPC handler that returns key
   material to the renderer.
5. **Crypto invariants** (see `src/main/sealing.js` and `vaultCrypt.js`):
   sealed shares are sign-then-encrypt, bound to the AUDIENCE (the sorted,
   digested recipient set — see `audienceOf`) in both the signature
   (payload ‖ audience) and the content GCM AAD, with each per-recipient
   wrapped content key additionally bound by `format ‖ recipient-fp ‖ audience`.
   Never weaken that to a single fingerprint, and never let the list travel
   unbound; saved-diff metadata
   is authenticated as AAD; a retired identity key DECRYPTS only — never sign or
   seal with one, and never let rotation destroy it silently, which would orphan
   unopened diffs; a rotation record is signed by BOTH keys and is ADVISORY, so
   the predecessor's signing key comes from the local trust store and never from
   the file being imported; expiry is capped at ONE WEEK (`MAX_TTL_MS` /
   `MAX_KEEP_HOURS` — keep the two in step) and enforced on both the sealing
   and opening side. The sender picks the window and the recipient gets that
   same window; a `.diffbro` has no replay protection by design, so this
   ceiling IS the replay window. Any change to these files requires
   updating `tests/` in the same change AND re-verifying the share
   roundtrip in the Docker env.
6. **Untrusted input is hostile.** Files chosen for import (`.diffbro`,
   `.diffbrokey`) get size caps, shape validation, and recomputed
   fingerprints before use. Keep it that way for any new import surface.
7. **Leaving the sandbox is fenced in main.** `shell.openExternal` has exactly
   three call sites, all of which confirm with the user first: `src/main/menu.js`
   (Report an Issue — `issueUrl.js` owns the origin and path; the renderer may
   pass an error message for the prefilled title, never a URL, and that message
   is anonymised, capped and `URLSearchParams`-encoded so it cannot add a
   parameter or a fragment) and
   `src/main/links.js`, which validates a renderer-supplied URL in the MAIN
   process — Claude links against the strict claude.ai allowlist, a URL
   snippet's link against an http(s)-only scheme check (`linkPolicy.js`). The
   scheme check is the fence: openExternal will otherwise open a local file, run
   a script handler, or launch another application. Adding a fourth call site
   needs the same treatment. The third is `src/main/mail.js`, the mail hand-off:
   the `mailto:` is BUILT in main from validated parts (`mailto.js`, addresses
   resolved from the trust store, never from the renderer) and checked on the way
   out by `linkPolicy.isSafeMailtoUrl` — `mailto:` scheme only, and an
   `attach`/`attachment` parameter is REFUSED rather than ignored, because some
   clients once honoured it and it turns a mailto: into "read this local file and
   send it". The renderer supplies fingerprints and text; it never supplies a URL.
   **URL snippets are local-only**: `_bundle` and
   `restoreBundle` drop them, so a link can never arrive in a shared bundle and
   be opened with one click.

   Three sibling surfaces hand a PATH to the OS rather than a URL, and are
   fenced the same way. `shell.showItemInFolder` has two call sites — `mail.js`,
   which reveals the sealed file it just wrote, and `logger.js` (`log:reveal`,
   which also uses `shell.openPath`); in both the path is COMPUTED IN MAIN and
   the renderer names no file. `mail.js` reveals the sealed file it just wrote — the path is the one main computed, never round-tripped through
   the renderer, and there is no handler that reveals an arbitrary one.
   **Copy as file** (`clipboardCopy.js`) stages bytes and puts the staged path on
   the clipboard; `clipboard:writeFile` takes **bytes and a display name, never a
   path**, so the renderer cannot name a file to stage, read one back, or learn
   the staging directory. Staged copies live in a `0o700` directory under the OS
   temp dir, are pruned after 30 minutes, and are swept both on `will-quit` and
   on next launch — the second sweep because a crash skips the first, and a
   snippet's plaintext surviving a reboot in `/tmp` is the failure that matters.
   A **secret snippet refuses Copy as file** for the same reason: its guarantee is
   that the contents never land somewhere readable, which a volatile text
   clipboard honours and a file on disk does not.

8. **No injection sinks.** `v-html`, `eval`, `new Function`, `innerHTML`
   are banned (ESLint-enforced). User-influenced strings render only
   through Vue text interpolation.

## The guides this repo follows

Four references, cited rather than installed — the rules below are the
enforceable subset, and these are where the reasoning behind them lives:

| guide                                                                                                  | what it is cited for                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript)                        | the primary reference. Variables → naming, Functions → size and argument count, Classes/SOLID → single responsibility |
| [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)                            | the module-level SRP argument (structure by component, not by layer)                                                  |
| [javascript-testing-best-practices](https://github.com/goldbergyoni/javascript-testing-best-practices) | this repo has shipped a test that never failed and an assertion that guarded nothing                                  |
| [Airbnb §23 Naming Conventions](https://github.com/airbnb/javascript#naming-conventions)               | the **naming section only** — never the config. Prettier owns formatting here                                         |

**What the build enforces, and what it cannot.** A standards doc that implies
lint carries the design rules is worse than one that admits which line the
reviewer holds:

|                | enforced by `npm run check`                                                                                                                                                                  | written convention, checked in review                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **naming**     | `camelcase` · `new-cap` · `no-underscore-dangle` (src only) · the `vue/*-casing` rules, which now FAIL rather than warn (`--max-warnings 0`)                                                 | intent-revealing names: a boolean reads `is`/`has`/`can`/`should`, a function starts with a verb, a name is pronounceable and searchable |
| **size**       | `max-lines-per-function` 60 and `max-lines` 250 on `src/**/*.js`, matching the cap `.vue` already had · `complexity` 10 · `max-depth` 3 · `max-params` 4 · `sonarjs/cognitive-complexity` 15 | — length is the one thing lint expresses completely                                                                                      |
| **separation** | `check-structure.mjs` (import cycles) · `no-restricted-imports` layering · the size caps as the proxy                                                                                        | which pattern applies: adapter, `BaseDialog`, tools registry, composable                                                                 |

**Two rules for the ratchets, and they are the whole point.**

- `scripts/lib/legacySize.mjs` holds one **exact** measurement per file that was
  already over a cap. The entry permits what exists and **not one line more** —
  add a line to `registerShareIpc` and the build fails. **Beat a cap and delete
  your entry**; `check-structure.mjs` fails on a stale one, so the map cannot rot
  into permanent permission. **Never raise a number.**
  `node scripts/check-structure.mjs --retighten` lowers them for you and refuses
  to raise one.
- `scripts/structure-baseline.json` holds the known import cycles. A new cycle
  fails; a baselined cycle that **disappears** also fails, so removing one is
  proven rather than claimed.

## How a feature is put together

Four rules, and they are what stops the grab bag re-forming. `diffStore` reached
1509 lines, 54 state keys and 93 actions because there was nowhere else to put
anything:

1. Everything a feature owns lives in `src/renderer/src/features/<name>/` —
   `<name>Store.js`, `index.js` (its only importable surface), `components/`,
   `components/styles/` — and nothing of it lives anywhere else. The store is capped at 250 lines like any
   other file.
2. A slice may import the core (`stores/`), `utils/`, `composables/` and shared
   `components/`. It may **not** reach into another slice's internals — only its
   `index.js` — and **the core may not import a slice at all**. Both are lint
   failures; the second is also what `check-structure.mjs` catches as a cycle.
3. Anything a menu, shortcut, palette entry, shelf chip or rail button can
   trigger is a row in `utils/commands.js`, **not** a new action on the core.
   Handlers receive the stores they need, so the registry stays pure and the core
   never reaches sideways. `commands.test.js` fails if an action named by
   `menus.js`, `TOOLS` or the palette resolves to nothing.
4. Its tests mirror its path under `tests/renderer/features/<name>/`.

State that many features raise and none owns — dialog visibility, the palette,
the theme — is **core** (`stores/uiStore.js`, `stores/settingsStore.js`), not a
slice.

Adding a slice needs no build wiring: the style and theme guards discover
`features/*/components/styles` themselves, and the coverage set includes
`features/**/*.js`. That discovery is deliberate — a hardcoded list is how a
directory move passes CI while silently removing enforcement.

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
  genuinely right. New UI must be checked in EVERY theme — see the
  design-proposal rule below, not just the two you happen to have open.
  `make theme-sweep` (scripts/theme-sweep.mjs) is how a NEW surface is checked:
  it drives the app through all 14, reads the COMPUTED colours off the live DOM
  and holds each pair to a floor declared per probe. `check:themes` holds the
  tokens; this holds what they compose into — a label on a `color-mix` chip, a
  control in its unset state. Add a surface to `SURFACES` when you build one.
- **A control must read as a control BEFORE it is touched, and `.btn-ghost` is
  only ever the dismissive twin.** Quiet is right for a Cancel or Close standing
  next to a primary that means the opposite; a lone ghost in a row reads as
  unavailable, which is how the whole diff toolbar came to look switched off
  until hovered. A neutral action with no primary beside it is a plain `.btn`.
  The resting `.btn` carries three cues on three axes — the `--btn-face` veil
  (the theme's own ink at 14%, so it steps toward the text on any ground rather
  than picking a surface that only lifts on half the palettes), the `--btn-edge`
  keyline at the 3:1 non-text floor, and `--shadow-1`. Hover and press step the
  same ladder (`--btn-face-hover` / `--btn-face-press`); the accent goes on the
  keyline and NEVER on the label, which scores below 4.5:1 on five themes. Off
  is the opposite language — flat, no lift, weak keyline — never the same
  properties at a lower opacity. `npm run check:themes` holds the resting face,
  its label and its edge to floors on all 14; that check exists because nothing
  measured the affordance the first time and a whole toolbar shipped looking
  disabled.
- **A UI/UX proposal is not a proposal until it has been checked against every
  supported theme.** `themes.css` ships 14 — light, dark, solar, neon, nord,
  sepia, dim, beacon, meridian, linen, bloom, nyan, matrix, contrast — and seven
  are light-ground. A design validated on one or two is a redesign waiting to
  happen, and redoing it costs far more than checking it would have. Before
  proposing OR building any visual change: read the real token values out of
  `themes.css` (parse them, never guess), render the idea against all 14, and
  say per theme where it breaks and why. Hardcoded colour is the usual culprit —
  a black rim plus a white top highlight is a dark-panel idiom that dies on
  every light theme; express it through `--border` / `--text` / `--shadow-rgb` /
  `--accent` so it re-tints itself. Two themes carry a contract, not a palette:
  `contrast` (`--border: #111111`) and `beacon` (`--border: #e0e0e0`) use a hard
  keyline deliberately, so anything that removes or softens a border is
  disqualified there and `npm run check:themes` is right to fail it. High-chroma
  accents (`matrix` #00ff41, `nyan` #ff2ecb, `neon` #22d3ee) turn any
  accent-tinted glow into a halo. A finished proposal carries the per-theme
  verdict, the exact token-driven CSS, and the trade-offs; a single-theme mockup
  is not a proposal.
- **Controls and glyphs use the predefined size scale — never a bespoke box.**
  `--control-h` (30px), `--control-h-sm` (26px) and `--chip-h` (20px) in
  `tokens.css` are the only heights a button, icon button or key chip may take,
  and `ui.css` already ships `.btn`, `.btn-sm`, `.btn-icon` and `.ql-kbd` for
  them. Never let a control's height fall out of padding + font-size: that is how
  the Esc chip drifted to 19px beside a 26px button, and it silently re-breaks on
  any type change. Reach for the existing class before writing CSS — three
  separate bespoke copies of `.btn-icon` had accumulated before anyone noticed. A
  class two components need lives in `ui.css`; a scoped copy in the second one
  will drift.
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
  border or resting control face lose contrast — the floors are a ratchet, never
  lowered to green a run.
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
- **Never re-sell the offline guarantee in the UI.** It is stated in the README
  and `docs/security.md`; repeating "stored encrypted on this machine only",
  "stays on this machine", "goes nowhere", "encrypted on save" or a padlock chip
  in every dialog, toast and footer does not make it truer — it reads as
  protesting too much, and it crowds out the thing the control actually does.
  UI copy states the **user-visible fact** ("Deletes itself automatically — 24
  hours is the maximum"), never the security posture behind it. The one
  exception is where encryption is the user's decision in that moment and they
  need to know the consequence — a passphrase they must not lose, or
  AES-256-CBC being unauthenticated. Those explain a choice; the rest was
  decoration.
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

- Coverage has a floor (`vitest.config.mjs`: 93% statements / 86% branches /
  92% functions / 95% lines over the main-process cores, stores, feature slices,
  utils and adapters) and `npm run check` enforces it. It is a ratchet: raise it as
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
- **A failing E2E keeps its trace.** Playwright clears `test-results/` at the
  START of a run, so a failure's trace is destroyed by the next run — which is
  how three sightings of the same intermittent were lost with nothing to show
  for them. `make e2e` copies the artifacts to a timestamped `e2e-failures/`
  folder before that can happen; open one with
  `npx playwright show-trace e2e-failures/<stamp>/<test>/trace.zip`. Never
  delete `test-results/` while chasing an intermittent.
- **macOS-only E2E runs on the Mac, not in Docker.** Some window-lifecycle bugs
  cannot exist on Linux — closing the last window quits the app there
  (`window-all-closed`), so the "app alive with no main window" state is
  unreachable. Those specs guard themselves with
  `test.skip(process.platform !== 'darwin', …)` so `make e2e` stays green, and
  are run natively instead:
  `env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/<spec>` after
  `npm run build`. **The `env -u` is not optional** — the agent shell exports
  `ELECTRON_RUN_AS_NODE=1`, which silently runs Electron as plain Node;
  the tell is `electron --version` printing a Node version and Playwright
  failing with `Process failed to launch!`. `e2e/quick-look-window-recovery.spec.mjs`
  is the worked example: it closes the main window, summons the launcher through
  the View ▸ Quick Look-up menu item (with no window there is no renderer to call
  `window.api`), then emits `activate` the way a Dock click does. A skipped spec
  proves nothing, so verify a macOS-gated test red→green by hand:
  `git stash push -- src/main/ && npm run build`, run it, restore.

## Workflow

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
