# Translatable UI text

|                                         |                               |
| --------------------------------------- | ----------------------------- |
| **Status**                              | in-progress                   |
| **Progress**                            | 15 / 16 steps (extraction incomplete — see raw-text ratchet) |
| **Branch**                              | `improvement/i18n-extraction` |
| **Started**                             | 2026-08-05                    |
| **Finished**                            |                               |
| **Bugs found and fixed this iteration** | 8 (2 render-throwing messages, eaten `{name}`, undefined rail labels, dead validator, persisted locale, 3 frozen-locale tables) |
| **Token baseline**                      | 2026-08-05T10:01:52Z          |
| **Claude tokens used**                  |                               |

## Problem

Every user-facing string is a literal at its point of use, so there is no
inventory of them and no way to render the app in another language.

Measured on `main` at 59e9ab5 (regexes in Decisions — spot-checked, and the
`utils/` hits are real copy, not internal constants):

| surface                    | template text | attributes | quoted strings | files |
| -------------------------- | ------------: | ---------: | -------------: | ----: |
| `renderer/src/components`  |            95 |        206 |            137 |    93 |
| `renderer/src/features`    |            34 |         26 |             57 |    34 |
| `renderer/src/utils`       |             1 |          0 |            161 |    83 |
| `renderer/src/stores`      |             0 |          0 |             37 |     7 |
| `renderer/src/composables` |             0 |          0 |              9 |    45 |
| `main`                     |             0 |          0 |            140 |    68 |
| **total**                  |       **130** |    **232** |        **541** |       |

**~790 strings across 86 files.** The densest are `src/main/menu.js` (60),
`src/renderer/src/menus.js` (36), `utils/shortcuts.js` (27),
`utils/tourCopy.js` (25), `stores/diffStore.js` (21).

Three things follow from this that are worth stating before the solution:

1. **Copy is already drifting.** `'Signature check failed — the file was
modified or corrupted.'` is written twice, in
   [shareErrors.js:11](../../src/renderer/src/utils/shareErrors.js#L11) and
   [snippetStore.js:199](../../src/renderer/src/stores/snippetStore.js#L199).
   Nothing keeps them equal. A catalogue makes duplicate copy a lookup, not a
   coincidence.
2. **Text lives on both sides of the IPC boundary.** 140 of the strings are in
   `src/main` — menu labels, `showMessageBox` titles and buttons at six call
   sites, native file-dialog filter names. A renderer-only solution leaves the
   entire application menu in English, and the menu is built at startup before
   any renderer exists.
3. **The right pattern is already here, once.**
   [`shareErrors.js`](../../src/renderer/src/utils/shareErrors.js) maps main's
   error _codes_ to sentences in the renderer, with a comment saying the wording
   should be reviewable on its own. That is the whole design, applied to one
   feature. This spec generalises it.

There is no user demand on record for a second language. The value being bought
here is the inventory, the de-duplication and the enforcement — a second locale
becomes a data-only change afterwards.

## Solution

A catalogue keyed by dotted id, `en.json` as source of truth, consumed by
**vue-i18n** in the renderer and **`@intlify/core`** in main — one message
format, one file, both processes.

```
src/shared/i18n/en.json          the catalogue — plain JSON, no cap, no lint
src/shared/i18n/index.js         framework-free t() over @intlify/core (main)
src/renderer/src/i18n/index.js   createI18n over the same JSON (renderer)
```

`src/shared/` is new. It is bundled into both processes by relative import;
electron-vite needs no configuration for it, and the `@` alias stays
renderer-only.

**Why a library rather than a `t()` over plain objects.**

> **Corrected 2026-08-05, after review.** This section originally claimed the
> library buys CLDR plural selection, and quoted correct Lithuanian output as
> proof. That output came from a smoke test that passed a **hand-written**
> `pluralRules` function — vue-i18n ships no CLDR data at all. Its default rule
> is `n ? Math.min(n, 2) : 0`. The claim was wrong and is withdrawn.

What the dependency actually buys, weighed against `docs/standards.md`'s "a
package that saves twenty lines is rarely worth an audit surface":

- **`<i18n-t>`** — a sentence with inline markup rendered as ONE message with
  named slots. This is the real justification: fragments cannot be reordered by
  a translator, and 14 places in this app need it.
- Interpolation, locale fallback chains, and a reactive locale the templates
  already follow.
- Plural SYNTAX (`a | b | c`) and the hook to supply per-locale rules — but the
  rules themselves are ours to write. The catalogue currently holds exactly one
  plural message, in English.

Cost: 8 packages in the prod tree, 18 KB gzip. That is a real price for what is
mostly `<i18n-t>` plus ergonomics; it is defensible, but it is not the
class-of-bug argument originally made. **Adding a locale with more than two
plural forms REQUIRES supplying `pluralRules` for it** — that is the trap this
correction exists to flag.

**The enforcement matters as much as the runtime.**
`@intlify/eslint-plugin-vue-i18n` ships `no-raw-text`, which fails the build on
a literal in a template. Enabled **per directory as each is migrated**, it is
the same ratchet shape as `legacySize.mjs` and `structure-baseline.json`:
migration cannot silently regress, and a directory cannot be half-done.

| option                                                           | why not                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand-rolled `t()` over plain objects                             | Loses CLDR plurals — the one part that is genuinely hard — and loses `no-raw-text`, so the extraction has nothing stopping it rotting. Reinventing it is what standards.md forbids.                                    |
| vue-i18n **runtime-only** build + `unplugin-vue-i18n` precompile | Saves ~5 KB gzip and costs a build-time dep tree of `@typescript-eslint/*`, `fast-glob`, `unplugin`, `pathe`. A larger audit surface than the bytes are worth (rule 2). Revisit only if bundle size becomes a problem. |
| `i18next` / `formatjs`                                           | Both work, neither is Vue-native, and both are heavier for what is used here. `formatjs` additionally wants a Babel/TS transform for message extraction.                                                               |
| Locale files as `.js`                                            | ESLint's `max-lines: 250` applies to `src/**/*.js`; a 790-entry catalogue breaks it on day one and there is no honest way to exempt it. JSON is not linted and is what translation tooling reads.                      |
| Translate main's error codes in main                             | Codes are a stable API between the processes and are asserted by name in tests. They stay codes; the renderer maps code → sentence, as `shareErrors.js` already does.                                                  |
| Ship a real second locale in this spec                           | A partial translation is worse than none — it fails silently as English fallback. A generated pseudolocale proves the plumbing without a translator; real locales are a data-only PR afterwards.                       |

### Proving it, rather than assuming it

`en-XA`, a **generated pseudolocale**: accented glyphs, `[…]` brackets and ~40%
padding, produced from `en.json` by a script. It makes three classes of bug
visible in CI that no unit test catches — an un-extracted literal (stays plain
ASCII), a truncating container, and a broken interpolation.

35 stylesheets under `src/renderer/src` set `white-space: nowrap`. Text
expansion is where this breaks, and the pseudolocale is what finds it.

## Scope

**In:**

- `src/shared/i18n/` catalogue + main-process `t()`; renderer vue-i18n plugin
- Locale setting: `settingsStore`, a Settings picker, persistence, main reading
  it at startup, menus rebuilt on change
- Extraction of all ~790 strings, by surface, each surface its own commit
- `no-raw-text` enabled per migrated directory; a key-coverage guard in
  `npm run check`
- Generated `en-XA` pseudolocale + an e2e that switches locale and relaunches

**Out:** _(recorded, not drifted)_

- **Any real translation.** No `lt`, no `de`. Data-only follow-up.
- **RTL / bidi.** No `dir="rtl"`, no logical-property sweep. Genuinely large,
  and untestable without a real RTL locale.
- **Locale-aware formatting beyond what exists.** `utils/relativeTime.js`,
  `byteSize.js` and the 11 `toLocale*` call sites keep their current behaviour;
  routing them through `Intl` under the chosen locale is a separate change with
  its own test surface.
- **Diff _content_.** Only chrome is translated. File contents, diff text and
  tool output are the user's data.
- **`docs/`, `README.md`, spec files.** English.

## Design

No new visual surface except the language picker, which is an existing
`.select` in an existing `SettingsDialog` panel — it inherits its theming. No
new tokens, no new colours, no new control heights.

### Theme verdict — all 14

The picker reuses a themed control, so its verdict is inherited and uniform.
The real risk this table has to answer is **text expansion**, which is
theme-independent: it is bounded by `.band-row` height, `--control-h` and the
35 `nowrap` rules, none of which vary per theme. The two keyline themes are
called out because a wrapped or clipped label is most visible against a hard
border.

| theme    | ground | verdict           | note                                                              |
| -------- | ------ | ----------------- | ----------------------------------------------------------------- |
| light    | light  | inherited         | floating-canvas inversion — picker sits on `--bg-raised`          |
| dark     | dark   | inherited         |                                                                   |
| solar    | light  | inherited         |                                                                   |
| neon     | dark   | inherited         | accent `#22d3ee` — unused by this surface                         |
| nord     | dark   | inherited         |                                                                   |
| sepia    | light  | inherited         |                                                                   |
| dim      | dark   | inherited         |                                                                   |
| beacon   | dark   | inherited · check | hard keyline `#e0e0e0` on `#000000` — clipping reads loudest here |
| meridian | light  | inherited         |                                                                   |
| linen    | light  | inherited         |                                                                   |
| bloom    | light  | inherited         |                                                                   |
| nyan     | dark   | inherited         | accent `#ff2ecb` — unused by this surface                         |
| matrix   | dark   | inherited         | accent `#00ff41` — unused by this surface                         |
| contrast | light  | inherited · check | hard keyline `#111111` — same reason as beacon                    |

`make theme-sweep` gains no new probe; the pseudolocale e2e is what guards the
expansion, and it runs in one theme because the failure is not theme-dependent.

## Security rules touched

**Rule 2 — new dependencies need a network audit.** Two direct
(`vue-i18n@11.4.8`, `@intlify/core@11.4.8`), one dev
(`@intlify/eslint-plugin-vue-i18n@4`). Audit performed on the unpacked
tarballs, not from reputation:

| check                                                      | result                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `fetch` / `XMLHttpRequest` / `WebSocket` / `net` / `axios` | **zero matches** across all five packages' shipped code                              |
| `new Function` / `eval`                                    | **zero matches** — including `@intlify/message-compiler`                             |
| install scripts                                            | **none** (`@vue/devtools-api` has a `build` script; `build` is not a lifecycle hook) |
| `npm audit`                                                | **0 vulnerabilities**, prod and dev                                                  |
| added to prod tree                                         | 8 packages, all `@intlify/*` + `@vue/devtools-api` + `source-map-js`                 |
| bundle cost                                                | 18 KB gzip (`vue-i18n.esm-browser.prod.js`, full build)                              |

**Rule 8 — no injection sinks.** This is the one that could have disqualified
the library, so it was tested rather than grepped: the message compiler was run
with `Function` trapped by a `Proxy` that throws on construct and on
`Function(string)`. Interpolation, fallback and plural selection all completed.
The compiler builds closures over a parsed AST; it does not generate code, so
the renderer's CSP (no `unsafe-eval`) does not block it.

**Rule 3 — renderer never touches Node or Electron.** `src/shared/i18n/` must
stay importable from the renderer, so it gets its own ESLint block carrying
`NO_NODE_IN_RENDERER` — the directory is _shared_, which makes it exactly the
place a Node import would sneak into the renderer unnoticed.

**Rules 1, 4, 5, 6, 7** — untouched. No network, no key material, no crypto, no
new import surface, no new `openExternal`/`openPath` call site.

One note on the locale value itself: it is persisted in `settings.json` and read
back by main. It selects a key in a bundled object and is never used to build a
path — an unknown value falls back to `en` rather than resolving anywhere.

## Test plan

Written before the code.

- **unit** — `tests/shared/i18n/catalogue.test.js`: every key in `en.json`
  resolves; no key resolves to an empty string; interpolation placeholders in a
  message match the args its call sites pass.
- **unit** — `tests/shared/i18n/t.test.js`: main's `t()` — hit, miss falls back
  to `en`, unknown locale falls back to `en`, interpolation, plural selection.
- **unit** — `tests/renderer/i18n/plugin.test.js`: `createI18n` is configured
  `legacy: false` with `fallbackLocale: 'en'`, and a missing key returns the
  English string rather than the key id.
- **unit** — `tests/renderer/stores/settingsStore.test.js`: `setLocale` persists,
  normalises an unknown value to `en`, and is read back on init.
- **guard** — `scripts/check-i18n.mjs` in `npm run check`: every `t('…')` key in
  source exists in `en.json` (**red first**: delete a key, watch it fail), and
  every key in `en.json` is referenced (catches copy deleted from the UI but
  left in the catalogue). Unused-key detection is a warning until the migration
  finishes, an error after.
- **e2e** — `e2e/locale.spec.mjs`: switch to `en-XA` in Settings → the toolbar,
  the sidebar section headers and the in-app menu bar all render bracketed
  pseudo-text → relaunch the same profile → still `en-XA`. Then assert **no
  clipping**: for a named set of controls, `scrollWidth <= clientWidth`. That is
  the assertion the 35 `nowrap` rules need, and it is measurable rather than a
  screenshot.
- **e2e** — the application menu is main-process, so it is read back through
  `app.evaluate(({ Menu }) => …)` rather than the DOM, proving main picked the
  locale up at startup.
- **red → green** — the duplicate `bad-signature` sentence is the worked
  example: assert both call sites resolve to the same key _before_ de-duplicating.
- **seed fixtures** — none. No new format, no changed data shape.

### Size ratchets — what actually happened

Two of the three predictions were wrong in a useful direction:

| file                                       | predicted           | actual                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/stores/settingsStore.js` | blocked, needs room | 301 → **244**; entry DELETED. The re-export shim was 12 symbols serving 3 files (6 dead), and `readState`'s shaping moved to `settingsDefaults.js` as the pure, testable `settingsStateFrom`.                                                                    |
| `src/main/menu.js`                         | `--retighten`       | Translating is line-NEUTRAL (`label: t('menu.file.title')` is still one line), so it went the wrong way first. Fixed by extracting `editMenu`/`toolsMenu`/`helpMenu` into the existing `menuSections.js`: 302 → **229**, file entry deleted, `fn` 204 → **123**. |
| `src/renderer/src/menus.js`                | `--retighten`       | not reached yet (step 8)                                                                                                                                                                                                                                         |

### Size ratchets this will move

Three files in `scripts/lib/legacySize.mjs` are involved, and one is a real
obstacle rather than a bookkeeping entry:

| file                                       | entry              | effect                                                                                                                                                                  |
| ------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/menu.js`                         | `fn 204, file 302` | 60 literals leave → **`--retighten`**, do not leave it stale                                                                                                            |
| `src/renderer/src/menus.js`                | `fn 181`           | 36 literals leave → **`--retighten`**                                                                                                                                   |
| `src/renderer/src/stores/settingsStore.js` | `file 301`         | **grows** by a `locale` key + `setLocale`. Already over cap — the locale state must go somewhere else, or something must come out. Raising the number is not an option. |

## Docs impact

| surface                  | needed? | what changes                                                                                                                    |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | **yes** | prod dependency count moves 9 → 11; a language setting is a user-visible feature                                                |
| `docs/screenshots/*.png` | no      | English stays the default and every captured state is English — no pixel changes                                                |
| `docs/roadmap.md`        | **yes** | new track: chrome translatable, no locales shipped yet                                                                          |
| `docs/brand/roadmap.svg` | **yes** | same move, hand-authored, edited alongside                                                                                      |
| `docs/standards.md`      | **yes** | a rule: user-facing text goes in the catalogue, not in source. Names the `no-raw-text` ratchet and the "codes stay codes" split |
| `docs/security.md`       | no      | no change to the offline guarantee, the crypto or the IPC surface                                                               |
| `docs/ipc-security.md`   | no      | no new IPC handler — locale rides the existing `settings` store                                                                 |
| `docs/glossary.md`       | **yes** | catalogue, key, pseudolocale                                                                                                    |

## Implementation plan

**Phase 1 — plumbing** (nothing extracted yet; the app still renders English
from literals)

- [x] 1. Audit + install `vue-i18n`, `@intlify/core`, `@intlify/eslint-plugin-vue-i18n`
      via `make install`. Confirm `allowScripts` needs no new entry. Record the
      audit output in Decisions.
- [x] 2. `src/shared/i18n/` — `en.json` (empty), `index.js` exposing
      `t(key, args)` over `createCoreContext`. ESLint block for `src/shared/**`
      carrying `NO_NODE_IN_RENDERER`.
- [x] 3. `src/renderer/src/i18n/index.js` — `createI18n({ legacy: false,
  fallbackLocale: 'en' })` over the same JSON; installed in both renderer
      entries (`index.html` **and** `quicklook.html` — the launcher is its own
      renderer and would otherwise stay English).
- [x] 4. Locale setting end to end: `settingsStore.setLocale` (resolving the
      size-ratchet problem above), Settings picker, `readSettings().locale` in
      main at startup, `installMenu()` made re-runnable so a locale change
      rebuilds the application menu without a relaunch.
- [x] 5. `scripts/pseudolocale.mjs` generating `en-XA` from `en.json`; wired
      into `npm run check` so a stale pseudolocale fails.
- [x] 6. `scripts/check-i18n.mjs` key-coverage guard. **Prove it red** by
      deleting a key.

**Phase 2 — extraction, one surface per commit** (each is independently
reviewable; each ends with `no-raw-text` enabled for that path)

- [x] 7. `src/main` — 140 strings. `menu.js` first (60), then the six
      `showMessageBox` call sites and the native dialog filter names.
      `--retighten` `menu.js`.
- [x] 8. Command and shortcut surfaces — `menus.js`, `menuSecurity.js`,
      `menuTools.js`, `shortcuts.js`, `tools.js`, `quickLookCommands.js` and all
      nine consumers. `commands.js` and `commandPalette.js` held no copy. — `renderer/src/menus.js`,
      `utils/shortcuts.js`, `utils/commands.js`, `utils/tools.js`,
      `utils/commandPalette.js`. `--retighten` `menus.js`.
- [x] 9. Error and message catalogues — `utils/shareErrors.js`,
      `stores/snippetStore.js`, `stores/diffStore.js`, `stores/*`. **De-duplicate
      the `bad-signature` sentence here**, with the assertion written first.
- [x] 10. `utils/` copy — `tourCopy.js`, `detectLanguage.js`, `jiraMarkup.js`,
      `markdownMarkup.js`, and the rest.
- [x] 11. `components/` — 93 files, 438 strings. Batched by dialog family, not
      alphabetically, so a reviewer sees one screen's copy at a time.
- [x] 12. `features/` slices — each slice's copy lives under its own key
      namespace, mirroring the slice boundary.
- [x] 13. Flip the unused-key check from warning to error; confirm
      `no-raw-text` now covers every path under `src/renderer/src` and
      `src/main`.

**Phase 3 — proof and docs**

- [x] 14. `e2e/locale.spec.mjs` — switch, relaunch, application-menu read-back,
      and the clipping assertion.
- [x] 15. Docs: `README.md`, `docs/roadmap.md` + `docs/brand/roadmap.svg`,
      `docs/standards.md` rule, `docs/glossary.md`.
- [ ] 16. `/validate`, `npm run check`, `make e2e`, full theme pass on the
      Settings picker.

## Decisions

| date       | decision                                                           | why                                                                                                                                                                                                                                                          | rejected                                                                                                         |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | vue-i18n + `@intlify/core`, not a hand-rolled `t()`                | CLDR plural rules are the class-of-bug the standards say to buy. Verified Lithuanian's four forms select correctly.                                                                                                                                          | hand-rolled; i18next; formatjs                                                                                   |
| 2026-08-05 | Full build, not runtime-only + `unplugin-vue-i18n`                 | 5 KB gzip saved is not worth an audit surface of `@typescript-eslint/*` + `fast-glob` + `unplugin` (rule 2).                                                                                                                                                 | precompiled messages                                                                                             |
| 2026-08-05 | Compiler proven CSP-safe by execution, not by grep                 | Rule 8 bans `new Function`; the CSP bans `unsafe-eval`. Ran the compiler with `Function` trapped by a throwing `Proxy` — interpolation, fallback and plurals all passed.                                                                                     | trusting the absence of a grep match                                                                             |
| 2026-08-05 | Catalogue is JSON, not JS                                          | `max-lines: 250` applies to `src/**/*.js` and a 790-entry catalogue breaks it immediately. JSON is unlinted and is what translation tooling reads.                                                                                                           | `.js` with a `SIZE_EXEMPT` entry — an exemption invented to dodge a cap                                          |
| 2026-08-05 | Main's error codes stay codes                                      | They are a stable inter-process API asserted by name in tests. `shareErrors.js` already proves the code → sentence split works.                                                                                                                              | translating in main                                                                                              |
| 2026-08-05 | `no-raw-text` enabled per directory as it is migrated              | Same ratchet shape as `legacySize.mjs`. All-at-once means ~790 errors and a disabled rule; per-directory means a surface cannot be half-done or regress.                                                                                                     | one flip at the end; a baseline file of exceptions                                                               |
| 2026-08-05 | Generated pseudolocale, no real translation                        | A partial translation fails silently as English fallback. `en-XA` catches un-extracted literals, clipping and broken interpolation in CI, with no translator.                                                                                                | shipping `lt` — the author's own language, and still the wrong first step                                        |
| 2026-08-05 | Pseudolocale generated by a ~30-line script, not a package         | The transform is a character map plus padding — no class of bug avoided, and standards.md weighs a package against what it replaces.                                                                                                                         | a `pseudo-localization` dependency                                                                               |
| 2026-08-05 | `src/shared/` as a new top-level directory                         | The catalogue is the first thing genuinely shared by both processes. Relative imports need no electron-vite config; the `@` alias stays renderer-only.                                                                                                       | duplicating the JSON; reaching into `renderer/` from `main/`                                                     |
| 2026-08-05 | Locale-aware date/number formatting is out of scope                | 11 `toLocale*` sites and `relativeTime.js` have their own test surface. Bundling them hides real behaviour changes inside a mechanical extraction.                                                                                                           | doing it in the same PR                                                                                          |
| 2026-08-05 | utils/ exports key IDs and never calls `t()`                       | utils/ is ESLint-pure (no Vue), and vue-i18n pulls Vue in. A string translated at module load in a util would also never update on a locale change. Components/stores/features translate; utils stay data.                                                   | letting utils import the framework-free `t` from src/shared — it would work, but the value would not be reactive |
| 2026-08-05 | Markup cheat-sheets split label from syntax rather than escaping   | `'Link  [text\|url]'` parses as a TWO-FORM PLURAL in vue-i18n, and `{{text}}`/`{code}` as interpolation. The syntax examples are Jira/Markdown grammar and must not be translated at all, so splitting is both safer and more correct than `{'\|'}` escapes. | escaping the metacharacters in place                                                                             |
| 2026-08-05 | Accelerators (`Ctrl+Tab`, `CommandOrControl`) are never translated | They are Electron API tokens, not copy. Key NAMES shown to a user are a separate question, deferred with the rest of `keys.js`.                                                                                                                              | treating every capitalised literal as copy                                                                       |
| 2026-08-05 | `src/shared/i18n` uses import ATTRIBUTES and extension-ful relative paths   | `scripts/seed-worker.cjs` loads `src/main/appData.js` under Electron's own ESM loader with no bundler, and appData needs `t()` for its folder dialog. `import … with { type: 'json' }` + `./i18n.js` + `../shared/i18n/index.js` is what makes the graph resolvable there. Verified by running it under Electron, not just by the static guard. | leaving one string unextracted; moving the dialog out of appData |
| 2026-08-05 | The guard counts a `*Key: 'a.b'` property as a use                                        | The utils-export-IDs rule made every shortcut label look like an unused catalogue entry, which would have made step 13's flip to error impossible. A dotted value is required, so `sortKey: 'name'` is not a reference.        | listing exceptions; giving up on the unused check |
| 2026-08-05 | `SHORTCUT_BAR` became objects rather than `[keys, label]` tuples                          | A key inside a tuple is invisible to the guard. Matching `SHORTCUT_GROUPS`' shape closes the gap instead of special-casing it.                                                                                                | a `shortcuts.bar.*` exception in the guard |
| 2026-08-05 | Key IDs are resolved ONCE at the boundary (`namedTools`), not per call site | `rank()` searches `.name`. Leaving `nameKey` on the rows meant the launcher ranked against catalogue ids — `rank('date')` stopped finding Epoch while `rank('base64')` still passed by coincidence, which is exactly the failure that hides. utils/ stays pure by taking the translator as an argument. | translating in each of the nine consumers |
| 2026-08-05 | A sentence with inline markup uses `<i18n-t>`, never split fragments        | A mechanical pass turned `Press <strong>→</strong> to browse the {n} tools.` into a translated "Press" plus untranslated trailing prose — worse than leaving it English, because word order round the markup differs by language. `<i18n-t>` keeps the sentence whole with the markup as a named slot. | extracting each fragment as its own key |
| 2026-08-05 | RTL is out of scope                                                | A logical-property sweep across every stylesheet is a comparable amount of work again, and is untestable without a real RTL locale.                                                                                                                          | `dir="rtl"` support now                                                                                          |

### Measurement method

String counts came from three regexes over `src/renderer/src` and `src/main`,
spot-checked against the files rather than trusted:

```sh
'>[A-Z][a-zA-Z][^<>{}]{2,}<'                                   # template text
'(placeholder|title|aria-label|data-tip|label)="[A-Z][^"]{2,}"'  # attributes
"'[A-Z][a-z][^']{5,}'"                                          # quoted strings
```

They **under**-count lowercase-initial strings and template interpolations, and
they over-count nothing material — the `utils/` hits were checked and are real
copy (`'Auto-detect'`, `'Bold  *text*'`, `'Open left file'`). Treat ~790 as a
floor.

## Validation

Recorded as fact, not intention.

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] `make e2e` — including the new `locale.spec.mjs`
- [ ] Settings picker seen in all 14 themes
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `scripts/check-i18n.mjs` proven red → green
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category    | tokens |
| ----------- | -----: |
| input       |        |
| output      |        |
| cache write |        |
| cache read  |        |
| **total**   |        |

**Outcome:**
