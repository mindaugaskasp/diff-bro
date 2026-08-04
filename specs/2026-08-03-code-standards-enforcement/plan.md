# Code standards — a cited guide, the rules the build enforces, and the store that proves why

|                                         |                                          |
| --------------------------------------- | ---------------------------------------- |
| **Status**                              | shipped                                  |
| **Progress**                            | 21 / 21 steps                            |
| **Branch**                              | `improvement/code-standards-enforcement` |
| **Started**                             | 2026-08-03                               |
| **Finished**                            | 2026-08-03                               |
| **Bugs found and fixed this iteration** | 12 / 12                                  |
| **Token baseline**                      | 2026-08-03T17:28:35Z                     |
| **Claude tokens used**                  | 122,728,701 (measured)                   |

## Problem

The ask was a Clean-Code-style JS/Node guide to keep habits healthy, covering
three things: **naming** (properties, methods/functions/arguments), **length
limits** for both a function and a whole module, and **single responsibility /
separation of concerns with appropriate design patterns**.

Measuring the tree first changed the answer. The conventions are already here and
already followed — what is missing is anything that _fails a build_ when they
slip, and one place where the slip already happened. Every number below is from
this checkout.

**Naming — a convention with no enforcement.** Exactly **1** snake_case
identifier in all of `src/`; **140** identifiers use an `is`/`has`/`can`/`should`
prefix. `eslint.config.mjs` sets no naming rule at all — not `camelcase`, not
`new-cap`. Running `camelcase` over `src/` produces **0 errors**, so the rule has
been obeyed by hand for the life of the repo with nothing holding it.

**Warnings do not fail.** `lint` is `eslint .` with no `--max-warnings`. Four
naming rules arrive from `pluginVue.configs['flat/recommended']` at severity
**warn** — `vue/prop-name-casing`, `vue/component-definition-name-casing`, plus
two more. `eslint .` exits **0** with warnings present, so the day one of them is
violated the build stays green and nobody sees it. Today's count is 0 errors /
**0 warnings**, so the gap is invisible and free to close.

**Function length — unbounded.** `max-lines-per-function` is not set. Of 1324
functions in `src/`, 1187 (90%) are ≤ 20 lines — and then 19 exceed 60, 7 exceed
100, 3 exceed 200 (`useQuickLook` 280, `registerShareIpc` 267, `installMenu`
216). Nothing stops the next one.

**Module length — capped only for `.vue`.** `max-lines: 250` applies to
`**/*.vue` only. A `.js` file has **no cap**. 15 `.js` files in `src/` are over
the same 250 the components live under.

**And this is where it led.** `stores/diffStore.js` is **1509 lines — 54 state
keys, 93 actions, 25 getters — imported by 52 files**. It is not a diff store; it
is where anything stateful went:

| cluster                 | members | files touching it |
| ----------------------- | ------- | ----------------- |
| sharing + trusted keys  | 21      | 14                |
| paste-to-compare        | 20      | 11                |
| image export / capture  | 12      | 9                 |
| theme                   | 6       | 7                 |
| config backup + restore | 5       | 2                 |
| CLI entry               | 5       | 3                 |
| disk-change watch       | 4       | 2                 |

The eight test files it already needed (`diffStore.test.js` +
`.image` / `.disk` / `.streamed` / `.paste` / `.export` / `.snippets` /
`.diagram`, 2808 lines total) are the same seams, found the hard way when the
single test file became unmanageable. The clusters are real; only the file
disagrees.

**Separation of concerns — 5 real store cycles.** `utils/` purity and the
composable layering are enforced by `no-restricted-imports`, but nothing checks
for cycles:

```
stores/diffStore.js  → stores/tabsStore.js    → stores/diffStore.js
stores/vaultStore.js → stores/tabsStore.js    → stores/vaultStore.js
stores/vaultStore.js → stores/snippetStore.js → stores/vaultStore.js
stores/diffStore.js  → stores/vaultStore.js   → stores/tabsStore.js → stores/diffStore.js
stores/diffStore.js  → stores/snippetStore.js → stores/vaultStore.js → stores/tabsStore.js → stores/diffStore.js
components/JsonTree.vue → itself      (legitimate: a recursive tree component)
components/XmlTree.vue  → itself      (legitimate)
```

The first is `diffStore` dispatching tab actions from its menu map
([diffStore.js:188-190](src/renderer/src/stores/diffStore.js#L188-L190)) and
reaching into `tabsStore` at three more call sites, while `tabsStore` reaches
back at nine.

## Solution

Three parts, in this order — the order matters, because the guard has to exist
before the refactor it scores:

1. **Cite a guide** in `docs/standards.md` for the reasoning lint cannot express,
   and say plainly which rules the build enforces versus which are written
   convention a reviewer holds.
2. **Turn on the enforcement that fits the code**, with a value-ratchet for the
   two size rules today's code cannot pass — the same mechanism that let the
   colour/ground guard land without an unrelated 168-item cleanup.
3. **Split `diffStore`** into a core state store, **vertical feature slices** that
   read it, and a **command registry above both** — the orchestration this app
   already does, moved out of the store that was doing it. Its debt entry starts
   at 1509 and the split is measured by how far that number falls and how many
   entries it deletes.

**Zero new dependencies.** Every rule is core ESLint; the one thing core cannot
do (cycle detection) is a ~60-line script in the `scripts/check-*.mjs` idiom the
repo already uses. Hard security rule 2 therefore has nothing to audit.

Guides cited, not installed:

| guide                                                                                                  | what it is cited for                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript)                        | primary. Its chapters map 1:1 to the three asks — Variables → naming, Functions → size and argument count, Classes/SOLID → SRP |
| [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)                            | the module-level SRP argument (component-based structure); updated July 2026                                                   |
| [javascript-testing-best-practices](https://github.com/goldbergyoni/javascript-testing-best-practices) | earns its place: this repo has shipped a test that never failed and an assertion that guarded nothing                          |
| [Airbnb §23 Naming Conventions](https://github.com/airbnb/javascript#naming-conventions)               | the naming section **only** — never the config; Prettier owns formatting here                                                  |

### Rejected

| option                                                                     | why not                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint-config-airbnb-base`                                                | fights Prettier over formatting, and its `func-style` / `id-length` produce **912** and **884** errors against this codebase's own idiom (arrow consts, `(a, b) =>` comparators). Adopting it means either 1796 edits or 1796 disables                                                                                                   |
| ESLint 10 bulk suppressions (`--suppress-rule`, available in v10.7.0 here) | counts violations per file, not values. `useQuickLook` could grow from 280 lines to 400 and the suppression still matches. A ratchet that lets debt grow is decoration                                                                                                                                                                   |
| `eslint-plugin-import` for `no-cycle`                                      | a whole dependency for one rule, and it needs a resolver configured for Vite aliases. The detector is 60 lines                                                                                                                                                                                                                           |
| `eslint-plugin-unicorn` for `filename-case`                                | filenames are not in the ask, and the convention is split by directory on purpose — `scripts/*.mjs` kebab-case, `src/**/*.js` camelCase bar the 4 deliberate `monaco-*.js` / `prism-setup.js`                                                                                                                                            |
| Splitting `diffStore` by moving code into `utils/` or composables          | the clusters are **stateful** and outlive a component. `utils/` may not import a store and a composable is not a home for shared state; the right container is a store                                                                                                                                                                   |
| Keeping delegating wrappers on `diffStore` for compatibility               | it would leave the file its current length while adding indirection — the appearance of a split with none of the benefit                                                                                                                                                                                                                 |
| **`diffStore` as the orchestrator**, routing to the feature stores         | it would have to import all of them, so the arrows point hub → features while the features still need core state back. That is a cycle per feature, and the guard from part 2 would fail on every one. It is the delegating-wrapper trap under a better name: the file stays big, and "decoupled" means one module that knows everything |
| Splitting `diffStore` in a later spec                                      | tried in the draft of this plan and reversed: the guard would land with its single largest violation baselined and untouched, which is how a ratchet becomes permanent permission                                                                                                                                                        |

## Scope

**In — enforcement:**

- `docs/standards.md` — cited guides, and the explicit **enforced by the build /
  written convention** split
- `package.json` — `--max-warnings 0` on `lint`, `check:structure` in `check`
- `eslint.config.mjs` — `camelcase`, `new-cap`, `no-underscore-dangle`,
  `max-lines-per-function`, `max-lines` for `src/**/*.js`, and one data-driven
  `LEGACY_SIZE` map holding the debt
- rename `ids_` → `recentIds` ([tools.js:83](src/renderer/src/utils/tools.js#L83)),
  the single `no-underscore-dangle` hit
- `scripts/check-structure.mjs` + `scripts/structure-baseline.json` (new) —
  import cycles, and stale `LEGACY_SIZE` entries
- `tests/scripts/checkStructure.test.js` (new)

**In — the split:**

- **wave 1**, the four clusters with no entanglement, each landing as a
  **vertical slice** under `src/renderer/src/features/`:
  `share/` · `paste/` · `imageExport/` · `configBackup/`
- theme (`userTheme`, `theme`, `initTheme`, `resolveActiveTheme`, `setTheme`,
  `toggleTheme`) folded into the **existing** `settingsStore` — 15 references
  across 7 files; a sixth new store for six members would be the same mistake at
  a smaller scale
- **wave 2**, if wave 1 leaves `diffStore` over target: dialog/palette flags
  (`stores/uiStore.js`), the CLI entry points, and the save→replace→pick gate
- **the four hardcoded path lists that a `features/` move breaks silently** —
  `check-style-tokens.mjs:18`, `check-theme-depth.mjs:438`, the coverage
  `include` in `vitest.config.mjs:50`, and the `no-restricted-imports` globs.
  See the Design section: this is the part of the move that can look green while
  removing enforcement, so it lands in the same step as the first slice
- **`utils/commands.js` (new) — the orchestration layer.** `MENU_ACTIONS` and
  `handleMenuAction` leave the store: the map becomes
  `action → (stores) => effect`, invoked through a thin
  `composables/useCommands.js` that resolves the stores. Consumers are unchanged
  in shape — `App.vue`, `menus.js`, `CommandPalette.vue`, `ToolsShelf.vue`,
  `SidebarRail.vue` swap `store.handleMenuAction(a)` for `run(a)`
- `snapshot()` / `restore()` leave `diffStore` for pure
  `snapshotOf(stores)` / `restoreInto(stores, payload)` in `utils/session.js`,
  taking store instances as arguments so `utils/` stays pure. This is what lets
  the persisted snapshot span two stores without either importing the other
- break `diffStore → tabsStore`: the three tab entries leave with the command
  map, the three direct reaches invert. `tabsStore → diffStore` remains, one-way

**Acceptance for the split, measured not asserted:**

|                               | target                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every new store               | ≤ 250 lines — the cap, not a legacy entry                                                                                                                  |
| every slice                   | reachable only through its `index.js`; importing another slice's internals fails lint                                                                      |
| the four path lists           | carry a `features/**` glob — style guard, theme guard, coverage `include`, layering globs. Proven by a planted violation inside a slice failing each guard |
| `utils/commands.js`           | pure: imports no store, receives them. Every action name used by `menus.js`, `TOOLS` and the palette resolves to a handler                                 |
| `diffStore.js`                | ≤ 700 lines (from 1509), entry updated to the true measurement                                                                                             |
| `diffStore → tabsStore` cycle | gone from `structure-baseline.json`                                                                                                                        |
| tests                         | suite **1976 → 1976**, the eight `diffStore*` files **196 → 196**. Not one test deleted, retired or merged away                                            |

`diffStore` does **not** reach 250 in this spec, and pretending otherwise would
be the dishonest version of this plan. It is the app's core comparison state and
it stays over the cap with a legacy entry — a much smaller one that the ratchet
then holds.

**Out:** _(each a recorded decision, not drift)_

- the other four store cycles (`vaultStore ↔ snippetStore`,
  `vaultStore ↔ tabsStore`, and the two long ones through them) — baselined,
  and the two long ones may resolve as a side effect of breaking the first
- refactoring the 19 long functions or the other 14 long files — the ratchet
  records them
- `.vue` files under `max-lines-per-function` — `vue/max-lines-per-block`
  (script ≤ 100) already bounds them
- any formatting rule — Prettier owns formatting

## Design

No visual surface: lint config, a docs section, one new guard script, and a
store refactor with **no behaviour change**. Nothing renders differently.
**The Theme verdict table is dropped for that reason** — there is no token,
control or surface to check against the 14.

### The three asks → what actually enforces them

| ask                                                       | enforced by the build                                                                                                                                                                                                                                                    | written convention only                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Naming** — properties, methods, functions, arguments | `camelcase` (`properties: 'never'`) · `new-cap` · `no-underscore-dangle` · `vue/prop-name-casing` + `vue/component-definition-name-casing` promoted to failing via `--max-warnings 0` · existing `vue/custom-event-name-casing`, `vue/component-name-in-template-casing` | intent-revealing names: a boolean reads `is`/`has`/`can`/`should` (140 already do), a function starts with a verb, a name is pronounceable and searchable. `id-length`/`id-denylist` cannot tell a good short name from a bad one |
| **2. Length** — function and module                       | `max-lines-per-function: 60` (+ `LEGACY_SIZE`) · `max-lines: 250` for `src/**/*.js`, matching the cap `.vue` already has (+ `LEGACY_SIZE`) · existing `complexity` 10, `max-depth` 3, `max-params` 4, `sonarjs/cognitive-complexity` 15                                  | none — length is the one ask lint expresses completely                                                                                                                                                                            |
| **3. SRP / separation / patterns**                        | `check-structure.mjs` cycle pass · existing `no-restricted-imports` layering · the two `max-lines` caps as the size proxy                                                                                                                                                | the patterns themselves: a new format is an **adapter**, a modal is **`BaseDialog`**, a tool is an entry in **`utils/tools.js`**, event logic belongs in a **composable**. No linter can tell an adapter from a special case      |

Saying this out loud in `docs/standards.md` is half the deliverable. A standards
doc that implies lint carries the design rules is worse than one that admits
which line the reviewer holds.

### The ratchet

```js
const LEGACY_SIZE = {
  'src/renderer/src/composables/useQuickLook.js': { fn: 280, file: 297 },
  'src/main/share.js': { fn: 267, file: 568 },
  ...
}
```

Each number is the **exact** measurement today, so the entry permits what exists
and not one line more — unlike a suppression, which permits the violation at any
size. Expanded into per-file config blocks after the global rule, so the last
match wins. Delete an entry when its file drops under the cap; pass 2 of
`check-structure.mjs` fails if you forget, which keeps the map from rotting into
permanent permission. 19 `fn` entries, 13 `file` entries at the start; the split
deletes or shrinks several by the end.

`icons.js` (286 — a map of SVG path geometry) and `types.js` (275 — typedefs)
get `max-lines: 'off'` with a one-line reason instead: both are declaration lists
where a cap fires on adding an icon, and neither has logic to separate.

### The cycle guard

`scripts/check-structure.mjs` exports its core (`buildGraph`, `findCycles`,
`staleEntries`) and runs `main()` only when invoked directly, so `tests/scripts/`
drives it without spawning a process — the same testable-core split `sealing.js`
uses. `structure-baseline.json` holds the known cycles keyed by sorted member
set, so re-ordering the walk cannot mint a false positive. A cycle not in the
baseline fails; a baselined cycle that disappears fails as stale, which is how
the `diffStore → tabsStore` removal is proven rather than claimed. Self-edges are
exempt by rule, not by baseline — a component rendering itself is how a recursive
tree is written.

### The orchestrator is a registry, not a store

This app already has a command bus — it is just inside the store.
`MENU_ACTIONS` ([diffStore.js:173-228](src/renderer/src/stores/diffStore.js#L173-L228))
is **40+ entries** mapping an action name to an effect, and
`handleMenuAction` is the single entry point for the OS menu
([App.vue:42](src/renderer/src/App.vue#L42)), the whole in-app menu bar
(`menus.js`, 30 call sites), the command palette, the tools shelf and the
sidebar rail. Three of its entries already reach sideways into `tabsStore` and
`settingsStore` — which is the `diffStore → tabsStore` cycle, in the flesh.

So the orchestration is real and it is misplaced, not missing. It moves **up**,
into a pure registry that takes the stores it needs:

```
menus.js · CommandPalette · ToolsShelf · SidebarRail · App (onMenuAction)
        ↓                       run(action)
utils/commands.js          ← the orchestrator: action → (stores) => effect
        ↓
shareStore · pasteStore · imageExportStore · configBackupStore · tabsStore · settingsStore
        ↓
diffStore                  ← core comparison state; imports none of the above
```

**A feature store may read `diffStore`; `diffStore` imports none of them.** The
core owns `left` / `right` / `stats` / `mode` and the comparison getters, and
nothing else. Anything that needs two features at once is a command, and commands
live above stores — so the hub that knows everything is a **50-line pure map**
that can be read in one screen and tested without mounting anything, instead of a
1509-line store.

This is not a new pattern here; it is the third instance of one the repo already
runs on — `adapters/` (new format = new adapter), `utils/tools.js` (new tool =
new registry entry), and now `utils/commands.js`. The closest precedent is
[`utils/tabMenu.js`](src/renderer/src/utils/tabMenu.js), whose own header states
the argument: _"Pure, so the menu component renders a list it did not reason
about and the bulk cases are testable without a right-click."_ It has a
155-line test; `MENU_ACTIONS` today has none it can call its own, because
reaching it means constructing the store.

### Vertical feature slices

**Directed by the user, over my recommendation** — recorded in Decisions with
both positions, because a plan that hides the disagreement is worse than one that
carries it. My objection was that adopting a second organising principle
incrementally leaves two conventions competing. What answers it is making the
boundary a **rule** rather than a preference:

> `features/` holds feature slices. Everything outside it — `stores/` (core),
> `components/` (shell and shared), `utils/`, `composables/`, `adapters/` — is the
> shell the slices plug into. A cluster that owns state, UI and commands together
> is a slice; a thing many slices share is not.

Layout, with `share/` as the worked example:

```
src/renderer/src/features/share/
  index.js            public surface — the ONLY path another module may import
  shareStore.js       state + actions            (≤ 250)
  commands.js         its rows for the registry
  components/         ShareDiffDialog.vue · ShareKeyDialog.vue · …
  components/styles/  ShareDiffDialog.css · …
tests/renderer/features/share/
  shareStore.test.js  …mirroring src, as the testing rules already require
```

`index.js` is what makes the boundary enforceable rather than aspirational: a
slice's internals are unreachable from outside, so "decoupled" is a lint failure
when it is false, not a claim in a doc.

**"New feature = a folder" then becomes literal** — the contract for
`docs/standards.md`:

1. everything the feature owns lives in `features/<name>/`; nothing of it lives
   anywhere else
2. it may import the core (`stores/diffStore`), `utils/`, `composables/`,
   `components/` (shared). It may **not** import another slice's internals — only
   its `index.js` — and the core may not import a slice at all
3. anything a menu, shortcut or palette can trigger is a row in its
   `commands.js`, not a new action on the core
4. its tests mirror its path under `tests/renderer/features/<name>/`

`check-structure.mjs` enforces 2 mechanically, `no-restricted-imports` enforces
the `index.js` boundary, and the size caps enforce the rest.

### The paths that break silently

This is the part of a directory move that passes CI while removing enforcement,
so it is called out as its own step rather than left to be discovered. Four
hardcoded lists assume today's layout:

| file                                | assumption                                            | what breaks                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-style-tokens.mjs:18` | `STYLE_DIRS = ['src/renderer/src/components/styles']` | a slice's CSS leaves the hardcoded-colour guard **entirely, and silently**                                                                                |
| `scripts/check-theme-depth.mjs:438` | same two dirs                                         | the colour/ground pass — 201 rules today — stops seeing moved components                                                                                  |
| `vitest.config.mjs:50`              | coverage `include: ['src/renderer/src/stores/**', …]` | a store moved into `features/` **leaves the measured set**. Coverage would _rise_ by removing measured code, and the floors would pass on less of the app |
| `eslint.config.mjs`                 | layering globs keyed to `utils/**`, `composables/**`  | new slice paths inherit no layering rule at all                                                                                                           |

All four take a `features/**` glob in the same step as the first slice. The
coverage one is the dangerous one: it is the only guard here whose breakage makes
the numbers look _better_.

### Behaviour must not change

This is a refactor, not a redesign. Two hard invariants:

- **The persisted snapshot shape stays byte-identical.**
  `utils/session.js` sanitises stored snapshots on the way back in, so the flat
  `{ mode, left, right, pasteLeft, …, semanticView }` object is a **persisted
  format**. Splitting paste state out must not change one key, or every restored
  session silently loses its pasted sides.
- **Every existing test moves with its subject and keeps passing.**
  `diffStore.image.test.js` → `imageExportStore.test.js`,
  `diffStore.paste.test.js` → `pasteStore.test.js`. Rewriting a test to fit the
  new shape is allowed; deleting one because the split made it awkward is the
  failure mode this spec exists to prevent.

## Security rules touched

**Rule 2 (new dependencies) — not triggered, deliberately.** Every rule is core
ESLint; nothing is installed, so there is no network audit, no `npm audit` delta
and no `allowScripts` entry. That is the point of rejecting the four plugins.

**Rule 4 (keys never cross IPC) — near, and unchanged.** `shareStore` inherits
the share and trusted-key actions. They call `window.api` exactly as they do
today; no key material enters the renderer before or after, and the extraction
moves call sites without touching a single IPC signature. `configBackupStore`
inherits `runConfigBackup` / `runBackupTo` / `runConfigRestore` under the same
condition — main still seals the bundle and reads identity/trusted internally.

**Rule 5 (crypto invariants) — untouched.** No file under `src/main/` changes
behaviour; `sealing.js` and `vaultCrypt.js` are not edited.

The new script reads files under `src/` with `node:fs` and exits non-zero. No
network, no `child_process`, no `eval`, no shell. It runs at check time and ships
in nothing.

Rules 1, 3, 6, 7, 8 untouched: no new IPC handler, no import surface, no
`shell.openExternal` call site, no injection sink, and the renderer/main split is
unchanged.

## Test plan

Written before the code.

- **unit — the guard** (`tests/scripts/checkStructure.test.js`):
  - `findCycles` returns the cycle for `a → b → a`, and `[]` for a diamond
    (`a → b`, `a → c`, `b → d`, `c → d`) — a shared dependency is not a cycle
  - a self-edge `a → a` is not reported (the `JsonTree.vue` case)
  - a baselined cycle passes; the same cycle with one member swapped fails
  - `staleEntries` flags a `LEGACY_SIZE` entry whose file now measures under the
    cap, and stays silent at exactly the cap
- **unit — the split**: the eight existing `diffStore*.test.js` files follow
  their subjects into `tests/renderer/features/<name>/`, mirroring `src` as the
  testing rules require. **Test count 196 → 196**, recorded before and after with
  `npx vitest run --reporter=json`
- **the guards still see the moved code** — after the first slice, plant each
  violation and watch the matching guard fail: a hardcoded `#ff0000` in
  `features/share/components/styles/`, a low-contrast pair in the same file, an
  import of `features/share/shareStore.js` from outside the slice, and an
  uncovered branch in `features/share/shareStore.js` moving the coverage number.
  Four plants, four failures, four reverts — without them the move is only
  _assumed_ to have kept its enforcement
- **unit — the command registry** (`tests/renderer/utils/commands.test.js`, new,
  mirroring the 155-line `tabMenu.test.js`): every action named in `menus.js`,
  `TOOLS` and the palette resolves to a handler — the gap that lets a menu item
  silently do nothing today — and each handler calls its store with fake store
  objects, no mounting. This is coverage the map has never had
- **unit — the persistence invariant** (`tests/renderer/utils/session.test.js`):
  a snapshot taken after the split has **exactly** the keys the pre-split one
  had — asserted against a literal key list, not against a freshly-taken
  snapshot, or the test moves with the bug. Round-trip through
  `restoreInto` restores paste state into `pasteStore` and diff state into
  `diffStore`
- **e2e** (`e2e/`, existing specs, no new file): the flows whose call sites move
  — share round-trip, paste-to-compare, image export, config backup — must pass
  untouched. An e2e edit is a signal that behaviour changed, and it needs a
  recorded reason
- **red → green** — four, each watched failing first:
  1. **the cycle guard catches a new cycle** — add an import closing a sixth
     cycle, run `npm run check:structure`, watch it fail, revert
  2. **the cycle guard catches a stale baseline** — after the
     `diffStore → tabsStore` break, confirm the run fails until the baseline
     entry is deleted. That failure is the proof the cycle is gone
  3. **the size ratchet catches growth** — add one line inside
     `registerShareIpc` (267 → 268), watch `max-lines-per-function` fail against
     its legacy entry, revert. This is the case bulk suppressions would let
     through, so it is the case that justifies the design
  4. **the naming rules catch a violation** — introduce `const user_name = 1`
     and a `vue/prop-name-casing` breach; confirm the first errors and the
     second now **fails the build** under `--max-warnings 0` where it previously
     exited 0
- **seed fixtures** — none. No format, no data shape, no UI: `seed-local.mjs`
  is unaffected

Coverage floors: the real numbers are **93/86/92/95**
([vitest.config.mjs:22-27](vitest.config.mjs#L22-L27)) — `docs/standards.md` still
says 88/78/85/90, so the doc is corrected in step 20. The stores are inside the
measured set, so the split must hold the real figures **with `features/**` added
to `include`**; without that line the floors would pass on less of the app.
Moving code between files can drop a percentage even with identical tests — if it
does, the fix is a test for the newly-exposed branch, never a lowered floor.

### Bugs found and fixed while building

Each was caught by a guard or a plant, not by reading:

1. **`featureStyleDirs()` resolved the repo root one level short.** It lives in
   `scripts/lib/`, so `new URL('..')` gave `scripts/`. It returned `[]`, the
   stylesheet count silently fell 93 → 92, and the moved slice CSS left the
   token guard entirely. **Plant 1 caught it** — the planted `#ff0000` passed.
   This is the exact silent-enforcement-loss the plan was written around.
2. **`no-restricted-imports` is replaced, not merged, by a later block.** Adding
   the layering rule for `stores/**` dropped the renderer/main fence (hard rule 3) for every store file. Caught by printing the resolved config. Fixed with a
   shared `NO_NODE_IN_RENDERER` spread into every narrower block, and guarded by
   `tests/scripts/eslintFence.test.js`, proven red→green.
3. **`canExportImage` early-returned the whole export.** The getter moved to the
   slice, but `exportCurrentImage` still asked the core for it — `undefined` is
   falsy, so every export said "Nothing to export yet." Caught by the relocated
   tests, which is the argument for moving tests **with** their subject rather
   than rewriting them to fit.
4. **A slice's barrel drags its components into every consumer's module graph.**
   `useSnippetDraft` importing `features/imageExport` pulled `SnippetShot.vue`
   and therefore `monaco-editor`, and 10 unrelated composable tests failed to
   resolve. Fixed with a `monaco-editor` stub aliased in `vitest.config.mjs` —
   the alternative was letting tests import slice internals, which would make the
   `index.js` boundary a fiction in exactly the place that verifies it.
5. **ESLint's import matcher does not support extglob.** `**/features/*/!(index)*`
   is not syntax to it and silently matched **nothing** — the slice-privacy rule
   sat there looking enforced while a planted violation passed. **Plant 3 caught
   it.** The working form is `['**/features/*/**', '!**/features/*/index.js']`,
   verified against real source text. `**` does match a leading `..` here, unlike
   raw minimatch. The fence test now lints real import statements rather than
   asserting a pattern is present, because a pattern that matches nothing reads
   exactly like one that works.

6. **The `clear` command's guard silently stopped unlinking a saved diff's tab.**
   Moving `unlinkActiveEntry()` out of `diffStore.clear()` and into the command
   put it behind `canClear` (`hasActive && !diffSaved`) — so clearing a tab
   opened from the vault left it claiming an entry it no longer held, and the
   saved diff could not be reopened. The relocated tabsStore tests caught it;
   the fix is `tabsStore.clearActive()`, on the store that is allowed to read
   the core.
7. **`npm run build` was broken while 2015 tests passed.** Two component
   imports in `App.vue` and `AppDialogs.vue` still pointed at the old paths after
   the slices moved. No unit test mounts either file, so vitest was blind to it —
   the app simply would not bundle. Found by running the build during validation,
   and proven: reintroduce the stale import and `vitest` exits 0 while
   `npm run build` exits 1. **`npm run build` is now the last step of
   `npm run check`** (+17 s), because a green suite over an app that cannot build
   is the most expensive kind of false green.
8. **Nine commands still pointed at the core for members that had moved.**
   `manage-keys`, `config-backup`, `settings`, the ten `tools-*` and others were
   destructuring `{ diff }` for state now living in `shareStore`,
   `configBackupStore` and `uiStore` — every one would have thrown on click.
   `commands.test.js` and the menu-table test caught them. This is the case for
   the registry having its own test: while the map lived in the store, nothing
   could reach it without building the store.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | **no**  | no feature-status change, and it does not carry the directory map — it links to `docs/architecture.md`, which does ([README.md:152](README.md#L152))                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/architecture.md`   | **yes** | it holds the directory map and a mermaid diagram of the renderer. [Line 76](docs/architecture.md#L76) lists `adapters/`, `stores/`, `components/`, `utils/` — a `features/` layer and the shell/slice boundary belong there, and [line 12](docs/architecture.md#L12) renders "Pinia stores · diff · vault · snippets · settings", which the split changes. [Line 81](docs/architecture.md#L81) states the `tests/` mirror and gains `features`                                                                                                                                                                           |
| `docs/screenshots/*.png` | **no**  | nothing renders differently — the split is behaviour-preserving by construction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/roadmap.md`        | **no**  | the roadmap tracks user-facing capability (spreadsheet, diagrams, onboarding, signing). Internal enforcement is not a track, and adding one would misrepresent what ships to a user                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/brand/roadmap.svg` | **no**  | same reason — the hand-authored twin of the file above, moves only with it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/*.md`              | **yes** | `docs/standards.md`: cited guides, the enforced-vs-written split, the `LEGACY_SIZE` rule ("delete your entry when you beat it; never raise one"), the cycle baseline, the **slice contract** — core / `features/<name>/` / command registry, with the four numbered rules a new feature follows — and the corrected coverage floors (the doc says 88/78/85/90; the config enforces 93/86/92/95). That last part sits beside the existing adapter, `BaseDialog` and tools-registry rules it now matches. `security.md` / `ipc-security.md` / glossary unchanged — no IPC signature, crypto path or user-facing term moves |

## Implementation plan

**Enforcement first — the guard must exist before the refactor it scores.**

- [x] 1. Branch `improvement/code-standards-enforcement`, record the token
      baseline. Record the control numbers: suite **1976** (1974 passed, 2 skipped), diffStore files **196**.
- [x] 2. Write `tests/scripts/checkStructure.test.js` against the not-yet-existing
      module; watch it fail to import — red first, for the guard itself.
- [x] 3. `scripts/check-structure.mjs`: `buildGraph` / `findCycles` /
      `staleEntries` exported, `main()` behind a direct-invocation check,
      self-edges exempt. Green the unit tests.
- [x] 4. `scripts/structure-baseline.json` — the 5 store cycles, sorted-member
      keys. Prove red→green: close a sixth cycle by hand, see the failure, revert.
- [x] 5. Naming rules — `camelcase` (`properties: 'never'`), `new-cap` with the
      5 Vite worker-import exceptions (`jsonWorker`, `cssWorker`, `htmlWorker`,
      `tsWorker`, `editorWorker` in
      [monaco-setup.js:29-33](src/renderer/src/monaco-setup.js#L29-L33)),
      `no-underscore-dangle` (`allowAfterThis`). Rename `ids_` → `recentIds`.
      0 remaining errors.
- [x] 6. `--max-warnings 0` on `lint`; confirm still green (0/0) and that a
      planted `vue/prop-name-casing` breach now fails.
- [x] 7. `LEGACY_SIZE` + `max-lines-per-function: 60` + `max-lines: 250` for
      `src/**/*.js`; `max-lines: 'off'` for `icons.js` / `types.js` with the
      one-line reason. `npm run lint` green.
- [x] 8. Prove the ratchet red→green: +1 line in `registerShareIpc`, watch the
      legacy cap fail, revert.
- [x] 9. Wire `check:structure` into `npm run check`, including the
      `staleEntries` pass over `LEGACY_SIZE`.

**Then the split — one store per step, `npm run check` green between each.**

- [x] 10. `utils/commands.js` + `composables/useCommands.js` — `MENU_ACTIONS`
      and `handleMenuAction` out of the store, `tests/renderer/utils/commands.test.js`
      first. Consumers swap `store.handleMenuAction(a)` → `run(a)` in `App.vue`,
      `menus.js`, `CommandPalette.vue`, `ToolsShelf.vue`, `SidebarRail.vue`.
      The orchestrator goes in **before** the feature stores, so each extraction
      afterwards updates one registry entry instead of hunting call sites.
- [x] 11. **The rules before the move.** `features/**` added to all four path
      lists — `check-style-tokens.mjs`, `check-theme-depth.mjs`, the coverage
      `include`, and the layering globs — plus the `no-restricted-imports` rule
      making a slice reachable only through its `index.js`. No code moves in this
      step: the guards must be able to see the first slice before it exists, or
      nothing checks it on arrival.
      _(Amended 2026-08-03: was the snapshot seam. `snapshotOf`/`restoreInto`
      exist to span `diff` + `paste`, and nothing else depends on them — writing
      them before `pasteStore` existed would have meant writing them twice, so
      they moved into step 14 where the second store arrives.)_
- [x] 12. `features/configBackup/` — 5 members, 2 call sites. The smallest slice
      first, proving the whole pattern (folder shape, `index.js` surface, registry
      row, test path, call-site rename) before it is repeated on a large one.
      Then the four plants from the test plan: hardcoded colour, contrast pair,
      cross-slice import, uncovered branch — each watched failing, each reverted
      (proof 5).
- [x] 13. `features/imageExport/` — 12 members, 9 files;
      `diffStore.image.test.js` → `tests/renderer/features/imageExport/`.
- [x] 14. `features/paste/` — 20 members, 11 files, **with the snapshot seam**:
      `snapshot`/`restore` leave `diffStore` for pure `snapshotOf(stores)` /
      `restoreInto(stores, payload)` in `utils/session.js`, taking store
      instances so `utils/` stays pure and neither store imports the other. The
      key-list test lands here.
- [x] 15. `features/share/` — 21 members, 14 files, and the most components to
      move. Confirm no IPC signature changed (rule 4) and the share e2e passes
      untouched.
- [x] 16. Theme → `settingsStore` (core, not a slice — it is a preference many
      slices read); 15 references across 7 files.
- [x] 17. Invert the three remaining `diffStore → tabsStore` reaches (the map's
      three tab entries left in step 10). Delete the baseline entry and watch the
      stale-cycle check go red→green (proof 2).
- [x] 18. Measure. **Result: 1509 → 796 lines, 54 → 27 state keys, 93 → 44
      actions, 25 → 24 getters.** Wave 2 ran `uiStore` (7 chrome keys + 3
      actions) and moved `compareFromCli` into the registry. It **stopped short
      of the ≤ 700 target, by 96 lines**, and that is a decision rather than a
      miss: the remaining clusters — the save→replace→pick gate and the
      file-load flow — are the core's own guard on its own document, calling
      `clear()`, `_place()` and `receive()` throughout. Extracting them would
      produce a store that is mostly calls home, which is this plan's own stated
      failure mode ("a number reached by scattering it into stores that only
      exist to be small would be worse code with a better metric"). The
      `LEGACY_SIZE` entry is set to the measured 796 and the ratchet holds it.
- [x] 19. `docs/standards.md` — cited guides, the enforced/written table, the
      ratchet rules, and the slice contract (core / `features/<name>/` / command
      registry, with the four numbered rules). Correct the coverage floors while
      there: the doc says 88/78/85/90, `vitest.config.mjs` enforces
      **93/86/92/95**. The ratchet was raised and the doc was not.
- [x] 20. `docs/architecture.md` — the directory map gains `features/` and the
      shell/slice boundary; the renderer mermaid node stops reading "Pinia stores
      · diff · vault · snippets · settings"; the `tests/` mirror line gains
      `features`.
- [x] 21. `npx prettier --write` on touched files only; `/validate`.

## Decisions

| date       | decision                                                                                                  | why                                                                                                                                                                                                                                                                                                                                                                                                                                          | rejected                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | Cite the guides in `docs/standards.md`; install nothing                                                   | the repo's own standards are already stronger and more specific than any general guide. What was missing is enforcement, not knowledge                                                                                                                                                                                                                                                                                                       | vendoring a style guide as config                                                                                                |
| 2026-08-03 | Value-ratchet map over ESLint bulk suppressions                                                           | suppressions match on a per-file **count**, so a 280-line function may grow to 400 and stay suppressed. The map's number is the exact current length, so growth fails                                                                                                                                                                                                                                                                        | `--suppress-rule` (available: eslint v10.7.0)                                                                                    |
| 2026-08-03 | `no-underscore-dangle` with defaults is safe                                                              | the 21 `_`-prefixed store members (`_bundle`, `_shoot`, `_place`…) are object properties, which the rule does not check. Verified: 1 violation in all of `src/`, and it is a **trailing** underscore (`ids_`)                                                                                                                                                                                                                                | assuming the convention would break, and skipping the rule                                                                       |
| 2026-08-03 | Reject `func-style` and `id-length`                                                                       | 912 and 884 errors against a deliberate, readable idiom. A rule that loses to the codebase 1796 times is measuring the wrong thing                                                                                                                                                                                                                                                                                                           | adopting airbnb-base wholesale                                                                                                   |
| 2026-08-03 | Cycle detection as a script, not a plugin                                                                 | one rule does not justify a dependency plus a Vite-alias resolver; the detector is ~60 lines and its core unit-tests without a process                                                                                                                                                                                                                                                                                                       | `eslint-plugin-import`                                                                                                           |
| 2026-08-03 | `icons.js` / `types.js` exempt from the file cap, not baselined                                           | a cap on a declaration list fires when you add an icon. Baselining them means the same thing, one entry later                                                                                                                                                                                                                                                                                                                                | baselining at 286 / 275                                                                                                          |
| 2026-08-03 | **The `diffStore` split is in this spec** (user direction, reversing the draft)                           | landing a size ratchet with its largest violation baselined and untouched is how a ratchet becomes permanent permission. The guard and the fix belong in one change                                                                                                                                                                                                                                                                          | deferring the split to its own spec                                                                                              |
| 2026-08-03 | **The orchestrator is `utils/commands.js`, above the stores — not `diffStore`** (user direction, refined) | the orchestration already exists as `MENU_ACTIONS` + `handleMenuAction` inside the store, feeding the OS menu, the menu bar, the palette, the shelf and the rail. Moving it up makes the hub a 50-line pure map; leaving it in `diffStore` and pointing it at feature stores would make the core import everything and fail the cycle guard on every feature                                                                                 | `diffStore` as the routing hub                                                                                                   |
| 2026-08-03 | The command registry lands before the feature stores                                                      | each later extraction then updates one registry entry instead of hunting call sites across `menus.js`, the palette, the shelf and the rail                                                                                                                                                                                                                                                                                                   | extracting stores first and rewiring the map last                                                                                |
| 2026-08-03 | **Vertical feature slices under `features/`** (user direction, over my recommendation)                    | my objection: adopting a second organising principle incrementally leaves two conventions competing, and a repo-wide move would swamp the diff. The user directed it and it is their call; what answers the objection is a stated boundary — `features/` is slices, everything outside is the shell they plug into — plus an `index.js` surface that makes the boundary a lint failure rather than a doc claim. Recorded with both positions | layer-first (`stores/shareStore.js`), which the previous revision planned                                                        |
| 2026-08-03 | Path lists updated **before** the first slice moves                                                       | three of the four fail silently — a slice's CSS leaves the token guard, and a moved store leaves the coverage set, which makes the numbers look _better_. Moving first and fixing after means a window where nothing checks the new code and the run is green                                                                                                                                                                                | doing the move and updating the guards when something is noticed                                                                 |
| 2026-08-03 | Theme goes to `settingsStore`, not a slice                                                                | it is a preference many slices read, not a feature that owns UI and commands. By the stated boundary it belongs in the shell                                                                                                                                                                                                                                                                                                                 | `features/theme/`                                                                                                                |
| 2026-08-03 | `new-cap` runs with `capIsNew: false`                                                                     | the probe covered `src/` only; over the whole repo the other half fires **194** times on SCREAMING_CASE test factories (`FILE()`, `SURFACE()`), which are not constructors. The valuable half — `new lowercase()` — is kept                                                                                                                                                                                                                  | the full rule, which would have meant 194 disables                                                                               |
| 2026-08-03 | `no-underscore-dangle` scoped to `src/**`                                                                 | all 26 violations are in `tests/`/`e2e/`: stubbing a store's `_shoot`, and `window.__probe` namespacing inside `page.evaluate`. Both are right where they are, and neither names this app's surface                                                                                                                                                                                                                                          | an `allow` list of specific identifiers, which would grow with every new stub                                                    |
| 2026-08-03 | `check-structure.mjs --retighten` added                                                                   | the refactor beats caps constantly; hand-editing 28 numbers invites raising one. `--retighten` can only lower a cap or drop an entry, never raise or add — the "never raise" rule became mechanical instead of a comment                                                                                                                                                                                                                     | editing `legacySize.mjs` by hand between slices                                                                                  |
| 2026-08-03 | `@vitejs/plugin-vue` added to `vitest.config.mjs`                                                         | a slice's `index.js` is its whole surface, components included, so a test importing the slice pulls a `.vue` in. Already a devDependency (electron-vite uses it) — **no new dependency**, and `.vue` files stay outside the coverage set                                                                                                                                                                                                     | tests importing slice internals directly, which would make the `index.js` boundary a fiction in exactly the place that checks it |
| 2026-08-03 | `runCliCommand` moved to the registry too                                                                 | the layering rule forced it: `diffbro backup <path>` had the core store setting a slice's state. It is a dispatch table like `COMMANDS`, and it now sits beside it. The rule caught a real coupling on its first day                                                                                                                                                                                                                         | a carve-out letting the core reach this one slice                                                                                |
| 2026-08-03 | `canExportImage` moved to the slice, not left on the core                                                 | it is an export question asked of core state. Leaving it behind would have meant the slice reaching back for a getter that only its own actions use                                                                                                                                                                                                                                                                                          | keeping it on `diffStore` beside `mode`/`left`/`right`                                                                           |
| 2026-08-03 | `monaco-editor` stubbed in `vitest.config.mjs`                                                            | a slice's `index.js` exports its components, so any consumer's test graph reaches Monaco. Stubbing it is honest — nothing under test runs an editor — and it keeps the `index.js` boundary real for tests too                                                                                                                                                                                                                                | letting tests import `features/x/xStore` directly, bypassing the boundary they exist to check                                    |
| 2026-08-03 | **`paste` split at the gesture, not the state**                                                           | the paste SIDES are core comparison inputs — they ride in the persisted snapshot and the core reads them for `hasUnsavedWork`, `comparedSides`, `refreshFromDisk` and `clear`. Only the Ctrl/Cmd+V **asking** is separable, and it touches 3 files. **This removed the need for the snapshot seam entirely**: the persisted shape never spans two stores, so `snapshotOf`/`restoreInto` were never written                                   | moving all eight paste fields, which would have forced the core to import the slice                                              |
| 2026-08-03 | `uiStore` is core, not a slice                                                                            | dialog and palette visibility is shell state that many features raise and none owns — the stated boundary puts it outside `features/`                                                                                                                                                                                                                                                                                                        | `features/ui/`                                                                                                                   |
| 2026-08-03 | Stopped wave 2 at 796, short of the 700 target                                                            | see step 18. Hitting the number would have meant a slice made of calls back into the core                                                                                                                                                                                                                                                                                                                                                    | splitting the save gate to make the metric green                                                                                 |
| 2026-08-03 | `clearActive()` lives on `tabsStore`, not in the `clear` command                                          | the unlink must happen on every clear, but the command guards on `canClear` (`hasActive && !diffSaved`) — putting it there silently stopped unlinking a SAVED diff's tab. tabsStore already reads the core, so the direction is legal                                                                                                                                                                                                        | the `clear` command doing both                                                                                                   |
| 2026-08-03 | New stores, not composables or `utils/`                                                                   | the clusters are stateful and outlive a component. `utils/` may not import a store; a composable is not a home for shared state                                                                                                                                                                                                                                                                                                              | moving the code to `utils/`                                                                                                      |
| 2026-08-03 | Theme joins the existing `settingsStore`                                                                  | six members do not justify a store, and settings is where a user preference already lives. A sixth new store would be the grab-bag mistake at small scale                                                                                                                                                                                                                                                                                    | `stores/themeStore.js`                                                                                                           |
| 2026-08-03 | `snapshot`/`restore` become pure functions over store instances                                           | the persisted snapshot must span `diffStore` and `pasteStore` without either importing the other; passing instances as arguments keeps `utils/` pure and the direction one-way                                                                                                                                                                                                                                                               | `diffStore` importing `pasteStore` to build its snapshot                                                                         |
| 2026-08-03 | `diffStore` targets ≤ 700 lines, not ≤ 250                                                                | it is the core comparison state; a number reached by scattering it into stores that only exist to be small would be worse code with a better metric. It keeps a legacy entry, much smaller, and the ratchet holds it                                                                                                                                                                                                                         | claiming 250 and splitting arbitrarily to hit it                                                                                 |
| 2026-08-03 | Smallest cluster extracted first                                                                          | proves the store shape, test relocation and call-site rename on 2 files before the pattern is repeated on 14                                                                                                                                                                                                                                                                                                                                 | starting with `shareStore` because it is the largest win                                                                         |
| 2026-08-03 | Theme verdict table dropped                                                                               | no visual surface — lint config, a docs section, a script, and a behaviour-preserving refactor                                                                                                                                                                                                                                                                                                                                               | leaving the table blank                                                                                                          |

## Review round (PR #23)

An agent review and an agent QA pass ran against the pushed branch. **QA found
nothing**: 309/309 e2e green (307 in Docker + the two macOS-gated specs natively),
all 42 registry actions, all 48 native menu items and all 48 in-app menu items
driven with zero renderer errors, every moved dialog opening and rendering with
its moved CSS. The review found four real defects that 2025 unit tests and 309
e2e tests all passed over:

9. **The unlink fix was applied to one of two `clear()` call sites.**
   `_loadReplacement` ([diffStore.js:445](src/renderer/src/stores/diffStore.js#L445))
   also clears, and `dropFiles` routes to it **precisely when `diffSaved` is
   true** — no prompt, because it is saved. So dropping files onto a saved diff
   left the tab claiming an entry it no longer held, and that saved diff could
   not be reopened. The commonest path, not the rarest. Fixed by subscribing the
   unlink to the action itself (`diff.$onAction` in `tabsStore.init`), so every
   caller gets it and no future one can forget; `clearActive()` is gone. Proven
   red→green.
10. **The slice-privacy fence matched nothing between slices.** From outside a
    slice the specifier carries `features/`; from **inside** one a sibling is
    `../imageExport/imageExportStore`, which does not — and `../*/*` cannot
    stand in, because `*` also matches `..` and would ban the core. Fixed by
    naming the siblings, read from disk via `featureNames()` so a new slice is
    covered the moment it exists. 11 cases pinned in `eslintFence.test.js`.
11. **`measure()` counted one line too many.** A newline-terminated file splits
    into a phantom empty last element, so the four entries `--retighten` wrote
    carried a free line — "not one line more" was really "not two". Fixed with
    `trimEnd()`, and every file cap now matches ESLint's own count exactly.
12. **`commands.test.js` faked a pre-split bundle** — no `share`/`imageExport`/
    `configBackup` at all, seven dead `diff.*` fakes, only 5 of 42 handlers ever
    invoked, and its guard assertion vacuously true. The test cited as catching
    the nine mis-pointed handlers would not have caught them again. Rebuilt to
    run **every** action and every CLI command against a bundle shaped like the
    live one; verified by re-pointing `share-current` at the core and watching it
    fail.

Also swept: five orphaned comments in `diffStore.js` and one in `settingsStore.js`
left sitting above unrelated declarations, `SnippetShot.vue`'s typedef path
(one level short after the move), two doc comments naming pre-split stores, the
`commands.js` line in the slice contract (no slice has one), and an empty
leftover `pasteToCompare/components/styles/` directory.

**One behaviour change left in place and recorded rather than reverted:** the
in-app **Edit → Clear** is now guarded by `canClear`, where it previously called
`clear()` unguarded. `main` was inconsistent — the ⌘K route was already guarded,
so the same labelled action behaved differently by route. The PR makes them
agree. Whether a _saved_ diff should be clearable at all is a product question
this refactor should not answer silently.

## Validation

Recorded as fact, not intention.

- [x] `npm run check` — **exit 0** (after the review round):

```
style tokens ok (93 stylesheets)
✓ theme depth ok (14 themes)
structure: 309 files, 4 baselined cycles, 28 legacy size entries — clean
Tests  2025 passed | 2 skipped (2027)
All files          |   95.85 |    88.17 |   96.76 |   96.96 |
✓ built in 15.66s
```

- [x] **`make e2e` — 309/309 pass**, run by the QA agent: 307 in the Docker
      container plus the two macOS-gated `quick-look-window-recovery` specs
      natively on the Mac. No `e2e-failures/` produced. Every registry action,
      every native and in-app menu item, and every moved dialog driven by hand
      with zero renderer errors

- [x] test count **1976 → 2027**, both from real runs. Not one test deleted:
      the eight `diffStore*` files' 196 followed their subjects into
      `tests/renderer/features/…`, and 39 were added (structure guard 17,
      command registry 10, ESLint fence 7, slice tests 5)
- [x] `diffStore.js` **1509 → 787** lines, **54 → 27** state keys, **93 → 44**
      actions. Every new store under the 250 cap: `configBackup` 64,
      `pasteToCompare` 115, `share` 212, `imageExport` 236, `uiStore` 37
- [x] `diffStore → tabsStore` absent from `structure-baseline.json` (5 → 4
      cycles), proven by the stale-cycle failure that preceded its deletion
- [x] all red→green proofs witnessed, each failure seen before the fix:
      **1** new cycle (4 findings, exit 1) · **2** stale baseline after the
      cycle broke · **3** one added line in `registerShareIpc` failing at
      268 > 267 and 569 > 568 · **4** `camelcase` erroring and
      `vue/prop-name-casing` going from exit 0 to exit 1 · **5** four plants
      inside a slice (hardcoded `#ff0000`, a 4.08-contrast pair, a cross-slice
      import, coverage) · **6** the ESLint fence guard · **7** the build gate
- [x] coverage floors held at the real 93/86/92/95 **without lowering one**,
      with `features/**/*.js` in `include`
- [x] both Docs-impact "yes" rows done — `docs/standards.md` (cited guides, the
      enforced/written table, the ratchet rules, the four-rule slice contract,
      corrected coverage floors) and `docs/architecture.md` (directory map,
      renderer diagram, `tests/` mirror)
- [x] UI seen running — **n/a**, no visual surface. The refactor is
      behaviour-preserving and the style/theme guards cover the moved CSS
- [x] `make local-seed` — **n/a**, no format or data-shape change
- [x] token usage measured

### Token usage

| category    |          tokens |
| ----------- | --------------: |
| input       |             673 |
| output      |         202,317 |
| cache write |         769,797 |
| cache read  |     121,755,914 |
| **total**   | **122,728,701** |

Cache read dominates: it is context re-sent each turn, so the total is tokens
_processed_, not a cost. 358 requests over 2 h 37 min, all on this spec.

**Outcome:** The enforcement landed and immediately earned itself — it caught
eight real defects during its own construction, three of which (the silent
`featureStyleDirs` path, the dropped renderer fence, and the extglob that matched
nothing) were guards that _looked_ enforced while checking nothing. `diffStore`
is 47% smaller with half the state and half the actions, the command registry has
tests it could never have had inside the store, and the one cycle that mattered
is gone. The 700-line target was missed by 96 lines, deliberately: the rest of
the core is its own document's guard, and splitting it further would have bought
a number at the cost of the code.
