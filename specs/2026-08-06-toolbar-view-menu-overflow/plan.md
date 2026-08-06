# Toolbar: a View menu for the display options, and a priority+ overflow for the actions

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 17 / 18 steps |
| **Branch** | `improvement/toolbar-view-menu-overflow` |
| **Started** | 2026-08-06 |
| **Finished** | |
| **Bugs found and fixed this iteration** | 12 / 12 |
| **Token baseline** | 2026-08-06T16:14:29Z |
| **Claude tokens used** | |

## Problem

The top bar silently loses its right-hand end, and the window cannot be made
narrow enough for the reader to be warned about it.

`.options` (`components/styles/AppToolbar.css:26`) is `overflow: auto hidden`.
Content past the edge is not clipped, it is **scrolled** — behind a
`scrollbar-width: thin` track inside a 46px band. Save, Share, Copy diff,
Capture and Clear all live at that end, so the primary action is the first thing
to go and nothing says it left.

Measured on the built app (Playwright, macOS, real `getBoundingClientRect()`
widths off the live DOM). `MIN_WIDTH = 1120` (`src/main/window.js:49`):

| condition | bar needs | window gives | hidden |
|---|---:|---:|---:|
| English, sidebar 256 | 1114 | 1120 | 0 |
| English, sidebar at its 384 cap | 1243 | 1120 | **111** |
| `en-XA`, sidebar 256 | 1381 | 1120 | **249** |

Six pixels of slack at rest. Where the 1114 goes:

| block | px | behaviour |
|---|---:|---|
| toolbar padding (`--bar-pad` ×2) | 24 | fixed |
| `.key-actions` | 255 | **variable** — `width: var(--sidebar-w)`, 256→384 |
| gap | 12 | fixed |
| four display toggles | **470** | the largest block, and all of it is text |
| divider + gaps | 25 | fixed |
| document actions | 328 | two disappear on a saved diff |

Three ordinary things push it over: dragging the sidebar (`SIDEBAR_MAX = 384`,
`utils/sidebarWidth.js:11`), a longer locale, and zoom — `ZOOM_MAX = 2.5`
(`src/main/menu.js:62`) is a factor of `1.2^2.5 ≈ 1.577`, so at maximum zoom a
1120px window offers the layout **710 CSS px**. Today that hides 404px.

Two smaller faults in the same controls, found while capturing the evidence:

1. Nothing in the renderer sets `color-scheme`, so the four stock
   `<input type="checkbox">` in `.options` paint in the **light** appearance on
   all seven dark themes — a white box on a near-black bar. Verified by
   screenshot on `matrix`.
2. Nothing sets `accent-color` on them either, so a ticked toggle wears the
   **operating system's** accent rather than the theme's, on all 14 themes.
   `SaveDiffDialog.css:18`, `SnippetEditorDialog.css:177`, `ToolBase64.css:38`
   and `ToolLines.css:42` all set `accent-color: var(--accent)`; the toolbar is
   the only place that forgot.

And one false claim in the source: `AppToolbar.vue:2` says "Every action has a
menu twin (menu.js / MenuBar.vue)". `toggle-split` and `toggle-structure` have
one; **Ignore whitespace and Focus on changes have neither a command row nor a
menu item** — they are reachable only by finding the checkbox.

## Solution

Two changes that attack the two different terms in the width, kept in one spec
because the second is only testable once the first has removed the noise.

**A · The four display toggles collapse into one `View` button.** A `.btn`
carrying the label, a count chip and `chevron-down`, opening a panel with the
same four controls stacked — each with room to state *why* it is unavailable in
a sentence rather than a tooltip. Measured on a token-faithful mock: the block
goes **470 → 113px** (English) / **138px** (`en-XA`).

**B · The document actions degrade in three rungs.** The bar measures itself and
sheds in this order: every control labelled → every control an icon → the least
important fold into a trailing `⋯` menu. A control loses its WORD before it
loses its PLACE. Save is pinned and never folds.

Projected totals with A in place (mock-measured, to be re-measured on the real
build at step 15):

| condition | bar needs | 100% zoom (1120) | max zoom (710) |
|---|---:|---|---|
| English, sidebar 256 | 764 | fits, 356 spare | **folds** |
| `en-XA`, sidebar 256 | 891 | fits, 229 spare | **folds** |
| `en-XA`, sidebar 384 | 1000 | fits, 120 spare | **folds** |

**Read this before approving.** A alone fixes every condition the app can reach
at 100% zoom, with 120px of slack in the worst case. B therefore buys nothing at
default zoom — its whole value is the guarantee at high zoom, on a wider
platform font, and in any locale longer than `en-XA`. That is a real guarantee
(the numbers above show it firing at every zoom ceiling), but if the appetite is
for the smallest change that fixes the reported bug, **A on its own is
defensible and B can be dropped**. Both were asked for, so both are planned;
splitting them is a one-line scope decision, and B's steps (2, 3, 5, 7) are
separable.

| option | why not |
|---|---|
| Icon cluster for the toggles (`Shrink`, −334px) | Keeps all four one click away and is locale-proof, but needs three invented glyphs (`columns`, `whitespace`, `focus`) and makes the tooltip the only place the control is named. Second choice; revisit if the toggle list grows past four. |
| Wrap the band to two rows (`Reflow`) | Four lines of CSS and nothing can ever hide — but it spends 38px of height exactly when the window is smallest, and the bar changes height under a drag. Kept as the fallback if A+B is judged too large. |
| Move the keys to the sidebar header, toggles to the status band (`Relocate`, −737px) | Biggest reclaim and it deletes the *variable* term, but `hasStatusBand()` (`utils/viewChrome.js:12`) is false in paste mode, before a comparison is ready, and for two identical text files — the toggles would vanish exactly when someone wants to check why two files look the same. Needs an unconditional band first, which is its own spec. |
| Just widen `MIN_WIDTH` | Moves the cliff, does not remove it; and it makes the app unusable on a 1280×800 laptop beside a second window. |
| Let `.options` keep scrolling, but show a fade/affordance | Makes the bug visible instead of fixing it, and a horizontal scroll gesture inside a 46px band is not a control anybody wants. |

## Scope

**In:**

- `View` button + popover replacing the four inline toggles (A)
- Three-rung degradation on the document actions: labelled → icon-only →
  priority+ `⋯` overflow (B). The middle rung was added mid-session on request.
- `Paste text` renamed `Paste mode`
- `color-scheme` and `accent-color` on the toggle controls
- Command rows + View-menu twins for `toggle-whitespace` and `toggle-focus`, so
  `AppToolbar.vue:2`'s claim becomes true and the palette reaches all four
- A shared `.popover` layer in `ui.css` — two components need it, and a scoped
  copy in the second is this repo's recurring failure

**Out:** *(recorded, not drifted)*

- Migrating `MenuBar.vue`'s inline dropdown state onto the new `usePopover`.
  It is Windows/Linux-only, so it cannot be exercised by `make e2e` on the Mac
  and carries regression risk out of proportion to the tidiness. Follow-up.
- `.key-actions` and the 255→384px variable term. That is `Relocate`, above.
- Raising `MIN_WIDTH`, touching `SIDEBAR_MAX`, or changing the zoom bounds.
- Keyboard shortcuts for whitespace/focus. They get menu items and palette
  entries; no accelerator, because the two free ones near `Cmd+\` are worth
  more elsewhere.

## Design

Token-driven throughout; no literal colour, radius or font-size.

**View button** — `.btn` at `--control-h`, `--font-md`, existing `.btn` face /
edge / lift ladder. `.btn.active` while its panel is open (`--btn-face-press` +
`--accent` keyline), which is the language the toolbar already speaks.
`<AppIcon name="chevron-down" />` — already in `icons.js`.

**Count chip** — `--chip-h` (20px), never grown from padding; `--radius-pill`;
background `--btn-face-press`, ink `--text`, `--font-xs`. **Not** `--accent` as
a fill under a label: the standards already rule that out (accent as label
ground is under 4.5:1 on five themes). Hidden at zero.

The chip counts options **differing from their default**, not options that are
on. `renderSideBySide` and `diagramFocus` both default to `true`
(`diffStore.js:71,73`), so an "on and available" count would read `2` on an
untouched diagram diff — noise dressed as information. Non-default means the
chip only ever says "you have changed N things".

**Popover panel** (shared `.popover` in `ui.css`, used by both):

- surface `--bg-elevated`, **not** `--bg-raised`. `--bg-raised` resolves to
  `--bg-panel` on 13 of 14 themes (`tokens.css:76`) — the same colour as the bar
  it hangs off — and on `light` it is `#ffffff`, identical to the editor `--bg`
  underneath. `--bg-elevated` is the panel mixed 12% toward the text, so it
  lifts on every theme by construction.
- `1px solid var(--border)` is **required**, not decorative. `--shadow-rgb` is
  `0 0 0` on all seven dark themes, so `--shadow-2` over `beacon` (`#000000`),
  `matrix` (`#020a04`) and `neon` (`#090d18`) lands on a ground it cannot darken
  and does not exist. The keyline is the only separation there.
- `--shadow-2` (raised element), `--radius-lg`, rows at `--control-h`.
- No accent-tinted glow anywhere on it.

**Rows** — `<label><input type="checkbox">` + name, with the unavailable reason
on a second line in `--text-hint` (not `--text-dim`: dim sits at the 3.0
non-text floor and drops under 4.5:1 as reading ink on `solar`, `nord`, `sepia`
and `bloom`). `accent-color: var(--accent)` and `color-scheme` set here.

**`⋯` button** — `.btn.btn-square` at `--control-h`, matching the three icon
buttons beside it. New `more-horizontal` entry in `icons.js` (three filled
circles, the `grip`/`list` idiom already in the map). Never accent-tinted when
items are folded — the count is carried by the panel, not a halo.

**Dismiss** — mirrors `MenuBar.vue:88`: a full-window backdrop element plus
Escape. The logic moves into `composables/usePopover.js` (composing the existing
`useBackdropClose`) so it is unit-testable without mounting, per the
interaction-bug rule.

`AppToolbar.vue` is at **91/100 script and 107/120 template lines** with no
`legacySize.mjs` entry, so it has 9 and 13 lines of headroom. Both features
must therefore land as child components, not inline — this is a hard constraint,
not a preference.

### Theme verdict — all 14

Values parsed from `styles/themes.css`. Surfaces judged: the popover panel over
the toolbar, the count chip, and the `⋯` button.

| theme | ground | verdict | note |
|---|---|---|---|
| light | `#ffffff` light | pass, one check | floating-canvas inversion: `--bg-raised` is `#ffffff` here and so is the editor `--bg` — the only theme where the panel would vanish on the surface below it, which is why the design takes `--bg-elevated`. Shadow reads (`--shadow-rgb: 0 0 0`). |
| dark | `#0d1117` dark | pass | reference case; nothing beyond the shared panel rule |
| solar | `#fffdf6` light | measure | weakest accent contrast in the set (`#e8590c` on `#fbf2dd`) — check the open-state `.btn.active` keyline is visible |
| neon | `#090d18` dark | pass, border-carried | shadow invisible on `#090d18`; `--border: #26344f` is quiet, so `--bg-elevated` does the lifting and the keyline confirms it. No accent glow — `#22d3ee` haloes. |
| nord | `#2e3440` dark | measure | lowest-chroma accent (`#88c0d0`); row body text must be `--text-hint`, dim is under the text floor here |
| sepia | `#e9dcbe` light | measure | same dim-ink floor problem as nord/bloom |
| dim | `#1b1917` dark | pass | muted amber `#d9a441`; open-state keyline reads weakest of the darks — eyeball it |
| beacon | `#000000` dark | pass, border is a contract | hard keyline `#e0e0e0`; every shadow is invisible on pure black, so the 1px border is load-bearing. Do not soften it. |
| meridian | `#f5f7f4` light | pass | the one theme with a tinted shadow (`--shadow-rgb: 20 40 45`); nothing at risk |
| linen | `#faf7f0` light | pass | no trap |
| bloom | `#f9f4f5` light | measure | dim ink under the text floor, same as sepia and nord |
| nyan | `#160a20` dark | pass, no glow | `--accent: #ff2ecb` haloes anything filled; `--border: #7a3fa6` is bright enough to carry the panel edge |
| matrix | `#020a04` dark | pass, no glow | `--accent: #00ff41` is the loudest pair in the app; disabled ink over `#020a04` nearly disappears, so use `--text-dim` at full opacity, never a dimmed `--text` |
| contrast | `#ffffff` light | pass | hard keyline `#111111` — anything that removes or softens a border is disqualified here, and this design adds one rather than removing any |

`make theme-sweep` gets a new `SURFACES` probe for the open popover; that is
what holds these verdicts after the build.

## Security rules touched

None of the eight. No IPC handler is added or changed, no fs, no crypto, no key
material, no new dependency, no `shell.openExternal`/`openPath` call site, no
`v-html`/`eval`/`innerHTML`. The work is renderer-only presentation over state
`diffStore` already owns.

Two adjacent notes: the new `menu.js` entries reuse the existing
`sendToFocused` channel with two new string action ids — no new surface, and
`commands.test.js` proves both resolve. And the `⋯` menu never renders a
user-supplied string; its rows come from the catalogue via `labelKey`.

## Test plan

Written before the code. Three bugs, three red→green pairs.

- **e2e — `e2e/toolbar-fit.spec.mjs`** (the reported bug, written first and
  watched failing). Asserts `.options.scrollWidth === .options.clientWidth` —
  i.e. nothing is scrolled out of sight — across four states: default;
  `--sidebar-w` at 384; locale `en-XA`; and `webContents.setZoomLevel(2.5)`
  with both. A visual defect gets an e2e driven the way a user hits it, and the
  assertion is a measurable quantity, not a screenshot.
- **e2e — `e2e/toolbar-view-menu.spec.mjs`**: open View, toggle Split view,
  assert `.monaco-diff-editor.side-by-side` disappears; assert the count chip
  tracks non-default options; assert Escape and an outside click both close the
  panel; assert an unavailable row is disabled **and states its reason**.
- **unit — `tests/renderer/utils/barFit.test.js`**: which ids fold for a given
  set of widths and an available width; pinned ids never fold; nothing folds
  when everything fits; the fold order is respected. Pure, no DOM.
- **unit — `tests/renderer/utils/toolbarActions.test.js`**: the rows a given
  store state produces — disabled flags and reason keys for streamed, non-text
  and saved-diff comparisons, which is where today's three tip computeds branch.
- **unit — `tests/renderer/composables/usePopover.test.js`**: Escape closes; a
  press that began inside the panel and released on the backdrop does **not**
  close (the `useBackdropClose` invariant); a second trigger press toggles shut.
- **unit — `tests/renderer/composables/useToolbarOverflow.test.js`**: recompute
  on resize, and no fold when the observer never fires.
- **unit — `tests/renderer/utils/commands.test.js`** (existing, extended):
  `toggle-whitespace` and `toggle-focus` resolve, and both guard on
  availability the way `toggle-split` does.
- **red → green** — each of the three bugs (overflow, `color-scheme`,
  `accent-color`) gets its test watched failing first. For the two CSS faults
  the assertion is a computed style read off the live DOM in the e2e, not a
  screenshot: `color-scheme` on the control's own computed style, and the
  checked control's `accent-color` resolving to the theme's `--accent`.
- **existing e2e to update** — five specs drive the checkboxes directly and
  will fail until they open the View panel first:
  `e2e/view-toggles.spec.mjs` (`getByLabel('Ignore whitespace').check()`,
  `getByLabel('Split view').uncheck()`), `e2e/json.spec.mjs`
  (nine `getByRole('checkbox', { name: 'Structure' })` calls plus a
  `.options label` `data-tip` assertion at :121), `e2e/diagram-diff.spec.mjs`
  (:69, :76, :111, :116, :204, :210), `e2e/csv-grid.spec.mjs` (:46–47),
  `e2e/diff-panes.spec.mjs`. A shared `openViewMenu(page)` helper goes in
  `e2e/fixtures.mjs` so the update is one edit per call site, not a rewrite.
- **seed fixtures** — none. No new format and no changed data shape;
  `scripts/seed-local.mjs` is untouched.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **no** | no architecture or feature-status change — the same four options over the same store state, reached one click deeper |
| `docs/screenshots/*.png` | **yes** | the toolbar is in every captured frame. `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff` all show the four labels and all go stale the moment they become one button. `make screenshots` runs **in the container** — `_electron` cannot launch Electron on the macOS host. README `alt` text checked against the new frames. |
| `docs/roadmap.md` | **yes** | one Done. bullet under the UI track — mermaid + terse bullets, no prose |
| `docs/brand/roadmap.svg` | **yes** | hand-authored twin of the same move; edited alongside, never regenerated |
| `docs/security.md` | **no** | no rule touched — see Security rules above |
| `docs/ipc-security.md` | **no** | no IPC handler added or changed |
| `docs/glossary.md` | **no** | no new domain term; "View menu" and "overflow" are plain UI words |
| `docs/standards.md` | **no** | this follows the existing rules rather than adding one. If `usePopover` proves out and `MenuBar` later adopts it, *that* change earns a line. |

## Implementation plan

- [x] 1. **Extend `e2e/toolbar-width.spec.mjs`** (not a new file — see Decisions),
      run it, **record it failing**. Done 2026-08-06: 3 new tests red, the 3
      existing ones still green.

      | new test | hidden px |
      |---|---:|
      | `a longer locale fits the toolbar as well as the application` | **188** |
      | `the toolbar fits with the sidebar dragged to its cap` | **110** |
      | `…at maximum zoom, in a long locale, at the cap` | **721** |

      The 110 matches the 111 projected from the standalone measurement. The
      locale figure is 188 rather than the 249 in the Problem table because the
      two measure different things: 249 came from substituting `en-XA` strings
      into the live DOM and totalling the blocks, 188 is the real overflow of
      `.options` after a real language switch at the real minimum size. The 188
      is the authoritative one; the 249 is left in the Problem table with its
      provenance rather than quietly restated.
- [x] 2. `utils/toolbarActions.js` — pure rows (`id`, `labelKey`, `tipKey`,
      `icon`, `action`, `disabled`, `priority`, `pinned`) + its test. Exports key
      IDs only; `utils/` never calls `t()`
- [x] 3. `utils/barFit.js` — `foldedIds({ widths, available, order, pinned })`
      + its test, mirroring `utils/railFit.js`. Done: 8 tests. The trigger
      off-by-one was proven red→green by removing `+ trigger` from the budget —
      it folds one control short and the bar then overflows by exactly the
      trigger's width.
- [x] 4. `composables/usePopover.js` + its test (composes `useBackdropClose`).
      Done: 7 tests. No window-level keydown listener — Escape binds to the
      ANCHOR, which contains trigger and panel, so it cannot leak to a second
      popover or outlive the component.
- [x] 5. `composables/useToolbarOverflow.js` + its test, on the
      `useFittingCount` / `ResizeObserver` pattern already in the repo. Done: 7
      tests. Widths are CACHED per id — a folded control is removed by `v-if` and
      measures 0, so re-reading the DOM every pass makes the fold cascade until
      nothing is left. Proven red→green by clearing the cache each pass.
- [x] 6. `.popover` layer in `styles/ui.css` — surface, keyline, rows, backdrop
- [x] 7. `components/ToolbarOverflow.vue` + `styles/ToolbarOverflow.css`;
      `more-horizontal` in `icons.js`
- [x] 8. `components/ViewOptionsMenu.vue` + `styles/ViewOptionsMenu.css` —
      button, count chip, four rows with reasons
- [x] 9. Rewire `AppToolbar.vue`: delete the four inline labels and the five tip
      computeds they carried; confirm script ≤ 100 and template ≤ 120 lines
      **without** adding a `legacySize.mjs` entry
- [x] 10. `color-scheme` + `accent-color: var(--accent)` on the toggle controls;
      watch the two style assertions go green
- [x] 11. `toggle-whitespace` / `toggle-focus` in `utils/commands.js`, guarded on
      availability like `toggle-split`; extend `commands.test.js`
- [x] 12. Menu twins in **both** `src/main/menu.js` and
      `src/renderer/src/menus.js`; correct `AppToolbar.vue:2`'s stale claim
- [x] 13. Strings into `src/shared/i18n/en.json`, then
      `node scripts/pseudolocale.mjs`; `npm run check:i18n` and
      `check:rawtext` (held at 0) clean
- [x] 14. Update the five existing e2e specs via `openViewMenu` / `setViewOption`
      / `closeViewMenu` helpers in `e2e/fixtures.mjs`. Done: 38 of 40 green; the
      two that remain red are `json.spec.mjs`'s two `openMenu` tests, which drive
      `.menubar` — `App.vue:112` is `<MenuBar v-if="!isMac" />`, so they cannot
      run on this host and are not touched by this change.
- [x] 14b. **Three-rung degradation** (asked for mid-session): a control loses its
      WORD before it loses its PLACE. Every row gained an icon, `barFit.barLayout`
      gained the compact rung, and `Paste text` became `Paste mode`.
- [x] 16. Add the open popover to `SURFACES` in `scripts/theme-sweep.mjs`; run
      `make theme-sweep`. Done: **462 measurements across 14 themes, clean.** It
      took three fixes to get there — see the Decisions rows for the 15 findings
      the first run reported.
- [x] 17. **Zoom moved off the window and onto the comparison** (asked for
      mid-session). `Cmd +/-/0` scale Monaco's font, the grid, and the structural
      and streamed rows; the frame is pinned at 1. New `e2e/diff-zoom.spec.mjs`.
- [x] 18. Docs: six screenshots regenerated in the container and each frame
      checked; README `alt` text corrected for the diagram frame (it promised a
      change-list rail the frame does not show); `docs/roadmap.md` gained a
      **Toolbar** track. `docs/brand/roadmap.svg` deliberately NOT touched — it
      is a curated four-track board that already omits Language, and a toolbar
      layout change is not a track on par with the four it carries.

### Open at hand-off — resolved 2026-08-06

1. ~~**The fold has never been observed firing.**~~ **Resolved: it fires, and B
   stays.** The failure was in the TEST, not the code: the locator was
   `getByRole('button', { name: 'More actions' })`, and the fold only happens
   after the switch to `en-XA`, where that accessible name is
   `[Ṁōřé àçţĩōńş ·øé·ø]`. Named in both locales, the spec is 6/6.

   Instrumented measurements off the built app, at each step of that test:

   | state | viewport | `.key-actions` | `.options` | non-action | available | folds |
   |---|---:|---:|---:|---:|---:|---|
   | default | 1400 | 255 | 1121 | 97 | 1024 | no |
   | minimum window | 1120 | 255 | 841 | 97 | 744 | no |
   | + sidebar at cap | 1120 | 383 | 713 | 97 | 616 | no |
   | + `en-XA` | 1120 | 383 | 713 | 121 | 592 | no |
   | + `ZOOM_MAX` | **710** | 384 | 303 | 121 | **182** | **yes — all but Save** |

   The earlier "58px spare" reading came from English at max zoom with the
   sidebar at rest, which is not the state the test drives. `docScroll` is 0 at
   every row, so nothing is hidden at any of them.
2. **Step 14 not started.** 23 existing e2e tests across the five predicted specs
   fail because they drive the old checkboxes directly. Expected and planned; the
   `openViewMenu` helper is not written yet.
3. Steps 15 (`make theme-sweep`, re-measure) and 16 (docs, five screenshots) not
   started.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-06 | Ship A and B together, but keep B separable | A fixes every reachable 100%-zoom condition with 120px spare; B's value is the guarantee at `ZOOM_MAX` (710 effective px), a wider platform font, and locales past `en-XA`. Both were asked for. | Dropping B silently, or shipping B first where it would have measured nothing |
| 2026-08-06 | Count chip counts **non-default** options, not options that are on | `renderSideBySide` and `diagramFocus` both default to `true`, so an "on" count reads 2 on an untouched diagram diff — noise dressed as information | Counting on-and-available; showing no chip at all, which hides that state moved behind a click |
| 2026-08-06 | Both features land as child components, not inline | `AppToolbar.vue` has 9 script and 13 template lines of headroom against the caps, and it has no `legacySize.mjs` entry to spend. Raising a cap is not the fix. | Inlining either one; adding a ratchet entry |
| 2026-08-06 | Popover surface is `--bg-elevated` + a required `1px --border` | `--bg-raised` is `--bg-panel` on 13 of 14 themes — the same colour as the bar it hangs off — and `--shadow-rgb: 0 0 0` makes `--shadow-2` invisible on `beacon`/`matrix`/`neon` | `--bg-raised` + shadow, which would be an invisible panel on four themes |
| 2026-08-06 | New `usePopover`, `MenuBar.vue` not migrated | MenuBar is Windows/Linux-only, so `make e2e` on the Mac cannot exercise it; the regression risk outweighs the tidiness. Recorded as a follow-up rather than left as an accident. | Refactoring MenuBar in the same change; leaving the new popovers' logic inline in their SFCs |
| 2026-08-06 | Whitespace and Focus get command rows and menu twins | `AppToolbar.vue:2` already claims every action has one, and it is false for these two. The popover makes all four equal citizens, so the menu should mirror that. | Leaving them checkbox-only; adding accelerators too (the free keys near `Cmd+\` are worth more elsewhere) |
| 2026-08-06 | Fix `color-scheme` / `accent-color` here rather than as their own spec | The controls carrying both faults are being rewritten in this change; fixing them separately means touching the same lines twice | A standalone CSS spec |
| 2026-08-06 | Extend `e2e/toolbar-width.spec.mjs` rather than add `toolbar-fit.spec.mjs` | The spec already exists and already owns this invariant, including the `getMinimumSize()` indirection so the bound and the test cannot drift. A second file asserting the same property is the duplicate this repo keeps re-growing. | A new spec file, as originally planned at step 1 |
| 2026-08-06 | **This change reverses a recorded intent.** `a longer locale scrolls the toolbar, never the application` asserted only that the DOCUMENT stayed put, and its name and comment say the toolbar "absorbs it internally" — i.e. today's scrolling is documented as intended, not as a defect | Absorbing it means the primary action scrolls out of sight behind a hairline track with nothing to say it left. The test is renamed to `…fits the toolbar as well as the application` and now asserts both halves. Reversing an earlier decision deliberately, in writing, rather than editing past it in silence. | Leaving the weaker assertion in place beside a new stronger one, which would have left the repo asserting both that the bar may scroll and that it may not |
| 2026-08-06 | Share is foldable, only Save is pinned | Pinning is a promise the control fits. With Share pinned the pinned set alone still overflowed by 18px at max zoom in en-XA at the sidebar cap — so the promise was false. Share folds LAST of the foldables. | Pinning Save + Share + View as the plan first stated |
| 2026-08-06 | `.options` is `flex: 1; min-width: 0` with the auto margin on its FIRST CHILD | Two measurement bugs, both found by running it: with `margin-left: auto` on the row itself it shrink-wrapped its content, so clientWidth measured what was SHOWN and folding one control "proved" there was no room for the next — the bar collapsed to Save alone at every width. Replacing it with `justify-content: flex-end` then made overflow spill BACKWARDS off the start edge, where scrollWidth cannot see it, so the detection went blind. An auto margin on the first child resolves to 0 when space runs out, so the row falls back to flex-start and overflows rightward where it is measurable. | `margin-left: auto` on the row; `justify-content: flex-end` |
| 2026-08-06 | The overflow trigger is sized from `--control-h`, not measured from a parked element | A hidden-but-measurable trigger kept in the row extended past the right edge and scrolled the whole DOCUMENT sideways by 18px at every window size — it broke the oldest assertion in the spec. A `.btn-square` is exactly `--control-h` wide by definition, so the size scale is the honest source. | An always-mounted ghost element with `visibility: hidden` |
| 2026-08-06 | `color-scheme` declared per theme in `themes.css`, guarded by a test against `themes.js` | Fixes every native control app-wide rather than only the toolbar's, and sits beside the palette it must agree with. The registry's `dark` flag is the other half of the fact, so a unit test holds the two together — proven red→green against both a missing and a wrong declaration. | A per-element binding like ToolEpoch's; a JS side-effect in `applyTheme` |
| 2026-08-06 | `structureLabel` became `structureLabelKey` | It returned the English words 'Diagram'/'Grid'/'Structure' from a store getter, so that label stayed English in every locale — one call site and three assertions to fix. | Leaving it, and having the View menu's own row untranslatable |
| 2026-08-06 | **Zoom scales the comparison, not the window** | Asked for. Chromium's `setZoomLevel` took the toolbar and sidebar with it, which is exactly what let the bar run past the window's own minimum — the bug this spec opened on. `Cmd +/-/0` now drive `uiStore.diffZoom`; the frame is pinned with `setVisualZoomLevelLimits(1, 1)` plus a `zoom-changed` reset, because pinch and Ctrl+wheel are two more ways in that the accelerators do not cover. | Removing the keys entirely (the text diff would have had no zoom at all); Ctrl+wheel only, which is discoverable by gesture alone |
| 2026-08-06 | **The zoom base is read back from Monaco, never a constant** | Monaco's default `fontSize` is PLATFORM-SPECIFIC — `platform.isMacintosh ? 12 : 14` (`editorOptions.js:2735`). A `BASE_FONT_PX = 12` was written first and would have silently shrunk every diff on Linux and Windows from 14 to 12 while looking correct on the Mac it was developed on. `DiffViewer` now reads the resolved size back once, before any zoom has moved it. | Hardcoding 12; setting an app-chosen size, which changes the resting diff on every platform |
| 2026-08-06 | A virtualized view zooms its ROW HEIGHT with its font | The grid, the structural view and the streamed view compute their spacers from an exact row height. Scaling the font alone makes those spacers describe a list of a different size than the one drawn. `useVirtualRows` now takes a ref/getter for the height, exactly as it already did for the count. | Scaling only the text diff; scaling the fonts and leaving the heights, which the new e2e catches at 5px of drift |
| 2026-08-06 | **Bug: `--grid-row-h` was set but never read** | The component published the var and `SpreadsheetGrid.css` hardcoded `height: 24px` beside a `GRID_ROW_H` of 24 in JS — two copies of one fact, which stayed true only while neither moved. Zoom moved one. The CSS now reads the var, and `line-height` is pinned so the row cannot outgrow the height declared for it. | Leaving the duplicate and zooming only Monaco |
| 2026-08-06 | **Theme sweep: `.btn.active` steps to `--btn-face-hover`, not `--btn-face-press`** | Press is `--text` at 30%, which on nord lands close enough to the ink that the label itself scored 3.96 — under the reading floor, in a state that PERSISTS for as long as a popover is open, unlike the momentary `:active` it borrowed the face from. The accent keyline is what says "open". | Lowering the sweep's floor; a per-theme `--btn-face-press` override |
| 2026-08-06 | **Theme sweep: the unavailable popover row is `--text-hint`, not `--text-dim`** | `dim`'s 3.0 floor is held against `--bg-panel` (`check-theme-depth`'s `dim/panel`), and the popover is `--bg-elevated` — the panel mixed 12% toward the text. Dim ink loses that margin on the way up: 2.92 on nord and 2.82 on sepia, for a word the reader still has to identify. | Keeping dim and lowering the probe's floor |
| 2026-08-06 | The `action, primary` probe enforces 3.0, the floor the repo ALREADY holds that pair to | `--text-on-accent` over `--accent` is `check-theme-depth`'s `onAccent/accent` at min 3.0. It sits under 4.5 on dark, solar and meridian — a pre-existing decision about every primary button in the app, not something this surface introduced. Enforcing a stricter floor here would have reopened it by accident. | Probing at 4.5 and changing three themes' `--text-on-accent`; deleting the probe, which hides a real measurement |
| 2026-08-06 | **Bug: the View trigger was ambiguous on Linux** | `getByRole('button', { name: /^View/ })` matches the in-app MenuBar's own View menu, which only renders on Windows/Linux — so every helper passed on the Mac and died as a strict-mode violation in the container. Scoped to `.toolbar` in the fixtures, the theme sweep and the screenshot script. | Leaving it, and shipping helpers that only work on one platform |
| 2026-08-06 | **B stays.** The fold fires at `ZOOM_MAX`, so it is not dead code | Instrumented off the built app: the widest reachable layout leaves the action row 182px against 377px of content, and it folds to Save alone. The doubt came from a test whose locator was English-only while the state it drives is `en-XA` — a locale-blind assertion reading as a missing feature. | Deleting B as unreachable, on the strength of a measurement taken in a different state than the one under test |
| 2026-08-06 | **Three rungs, not two: labelled → icon-only → folded.** Asked for mid-session | A bar that folds the moment a LABEL does not fit hides a control the reader could still have reached with a glyph. Every row therefore carries an icon, and `barFit.barLayout` compacts the whole row before `foldedIds` folds anything. Compacting is uniform — a row with some labels and some glyphs reads as arbitrary rather than as a state. | Folding straight from labelled; compacting only the foldable rows and leaving Save labelled |
| 2026-08-06 | The compact width is `--control-h`, never measured | Measuring it would mean rendering the compact row to decide whether to render it, and a control that is not drawn measures 0. A `.btn-square` is exactly `--control-h` wide by definition — the same reasoning the overflow trigger already used, so both now come from one helper. | Rendering compact off-screen to measure it; a second ghost row |
| 2026-08-06 | Widths are measured ONLY while the row is labelled | Two failure modes, one guard: a folded control measures 0, and a COMPACT control measures `--control-h`. Either would overwrite the labelled widths the row needs in order to ever earn its words back. Proven red→green — the first version of that test passed without the guard and was rewritten until it failed for the right reason. | Re-reading the DOM every pass; caching a single width per id |
| 2026-08-06 | `aria-label` carries the label at EVERY rung | The accessible name then does not change when the word stops being drawn, which is what keeps ~40 existing e2e selectors working across the ladder — and is the honest a11y answer regardless. | Setting `aria-label` only in the compact state, as the icon-only rows used to |
| 2026-08-06 | `Paste text` → `Paste mode` | Asked for. `Paste mode`/`File mode` is a matched pair; `Paste text`/`File mode` named two different kinds of thing. | — |
| 2026-08-06 | **Bug: the cluster rules moved to `ui.css` as `.toolbar .group`** | `ToolbarOverflow.vue`'s template has TWO roots (the row and its `Teleport`), and Vue cannot put a parent's scope id on a fragment — so `AppToolbar.css`'s scoped `.group` silently stopped matching the action row, which fell back to `display: block` with every gap at 0. Descendant-scoped to `.toolbar` because `.group` is also `KeyboardShortcutsDialog`'s section class. Reported by the user from a screenshot, then measured and fixed red→green. | Globalising a bare `.group`, which would have re-laid-out the shortcuts dialog; a scoped copy in the second file, which is the drift this repo keeps re-growing |
| 2026-08-06 | **Bug: the re-measure signature carries the active locale** | The signature was `id:labelKey`, and a labelKey does NOT change when the language does — so a locale switch changed what every control measured while changing nothing about the size of the row, the `ResizeObserver` never fired, and the bar kept its English widths. It overflowed the document by **145px** in `en-XA` at the sidebar cap. Found by instrumenting the rungs, not by a test. | Watching `rows` deeply; re-measuring on every state tick |
| 2026-08-06 | **Bug: the sidebar section pills were hardcoded English** | Reported by the user against the pseudolocale. `SavedDiffs.vue`'s `SECTIONS` and `SidebarRail.vue`'s `groups` held literal `label:` strings, and a tag chip's tooltip was an English template literal. Neither guard could see them: `check:rawtext` scans TEMPLATES, and `check:i18n` only knows about keys that already exist. Now `labelKey` + `$t()` at the call site, so a locale switch reaches them. | Leaving the rail alone (same defect, same feature, two files apart) |
| 2026-08-06 | Overflow reads from one row array, not from the DOM | `utils/toolbarActions.js` feeds the bar and the menu from one source, so a folded action cannot drift from its inline twin, and the fold arithmetic stays pure and unit-testable | Cloning DOM nodes into the menu; rendering every action twice and toggling visibility |

## Validation

Recorded as fact, not intention.

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] `make e2e` — the new fit spec green, the five updated specs green
- [ ] UI seen running in the Docker env, in a light theme and a dark one
- [ ] `make theme-sweep` — all 14 clean with the popover in `SURFACES`
- [ ] real bar width re-measured against the projected 764 / 891 / 1000
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `make local-seed` — n/a, no fixture change
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category | tokens |
|---|---:|
| input | |
| output | |
| cache write | |
| cache read | |
| **total** | |

Cache read dominates: it is context re-sent each turn at a fraction of fresh
input, so the total is tokens *processed*, not a cost. `output` and
`cache write` track work produced.

**Outcome:**
