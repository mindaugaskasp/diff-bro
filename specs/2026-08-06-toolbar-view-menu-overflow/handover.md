# Handover — toolbar View menu + three-rung degradation

Updated 2026-08-06 at the end of the second session. The plan and its Decisions
table are in `plan.md`; this file is the shortest path back into the work.

| | |
|---|---|
| **Branch** | `improvement/toolbar-view-menu-overflow` (off `main`, nothing committed) |
| **Steps** | 17 of 18 done |
| **`npm run check`** | green — 2627 passed / 2 skipped, statements 95.05% |
| **`make theme-sweep`** | green — 462 measurements across 14 themes |
| **Blocking question** | none — the one the last session left is resolved |

## 1. What the change is

- **A · View menu.** The four display toggles collapse into one `View` button
  with a count chip and a popover checklist.
- **B · Three-rung degradation.** The document actions shed in this order:
  every control labelled → every control an icon → the least important fold into
  a trailing `⋯`. A control loses its WORD before it loses its PLACE. Save is
  pinned. The middle rung was added this session, on request.
- **`Paste text` → `Paste mode`.**

## 2. The question the last hand-off left — RESOLVED

**The fold fires; B is not dead code.** The failure was in the test: the locator
was `getByRole('button', { name: 'More actions' })`, and the fold only happens
after the switch to `en-XA`, where that accessible name is `[Ṁōřé àçţĩōńş ·øé·ø]`.
Measured on the built app at each step of that test:

| state | viewport | `.options` | available | rung |
|---|---:|---:|---:|---|
| default | 1400 | 1121 | 1024 | labelled |
| minimum window | 1120 | 841 | 744 | labelled |
| + sidebar at cap | 1120 | 713 | 616 | labelled |
| + `en-XA` | 1120 | 713 | 592 | **icons** |
| + `ZOOM_MAX` | 710 | 303 | 182 | **folded, Save alone** |

## 3. Bugs found and fixed this session — each red → green

1. **Locale-blind test locator** (above).
2. **The action row lost its flex layout.** `ToolbarOverflow.vue`'s template has
   TWO roots (the row + its `Teleport`), and Vue cannot put a parent's scope id
   on a fragment — so `AppToolbar.css`'s scoped `.group` stopped matching and the
   row fell to `display: block` with every gap at 0. Rules moved to `ui.css` as
   `.toolbar .group` (descendant-scoped because `.group` is also
   `KeyboardShortcutsDialog`'s class). Reported by the user from a screenshot.
3. **The bar never re-measured on a language switch.** The signature was
   `id:labelKey`, and a labelKey does not change with the locale — while the row
   it sits in does not change size either, so the `ResizeObserver` never fired.
   The document scrolled sideways by **145px** in `en-XA` at the sidebar cap.
   The signature now carries `settings.activeLocale`.
4. **The sidebar section pills were hardcoded English** (user-reported against
   the pseudolocale). `SavedDiffs.vue`'s `SECTIONS`, `SidebarRail.vue`'s
   `groups`, and a tag chip's tooltip. Neither guard could see them:
   `check:rawtext` scans TEMPLATES, `check:i18n` only knows keys that exist.
5. **The paste toggle lost its on-state** when the actions moved into
   `ToolbarOverflow` — caught by the existing
   `ui-affordances.spec.mjs › the paste-mode toggle shows an on-state`. The row
   now carries `active`.

Plus the four from session one (the width bug, `color-scheme`, `accent-color`,
and the `structureLabel` → `structureLabelKey` locale leak).

## 3b. Zoom moved off the window and onto the comparison

Asked for mid-session, and it closes the loop on the original bug: Chromium's
`setZoomLevel` scaled the toolbar and sidebar with the diff, which is what let
the bar run past the window's own minimum width in the first place.

- `Cmd +/-/0` drive `uiStore.diffZoom` through three new command rows. The frame
  is pinned in `src/main/window.js` (`lockDownFrame`) with
  `setVisualZoomLevelLimits(1, 1)` and a `zoom-changed` reset — pinch and
  Ctrl+wheel are two more ways in that the accelerators do not cover.
- Monaco reads the level through `diffEditorOptions`; the grid, structural and
  streamed views scale their font AND their row height, because all three are
  virtualized and compute their spacers from an exact height.
- `useVirtualRows` now takes a ref/getter for `rowHeight`, exactly as it already
  did for the count.
- `e2e/diff-zoom.spec.mjs` (3 tests) asserts the discriminating fact: the diff's
  font grows while `innerWidth`, the toolbar and the sidebar do not move a pixel.
  Under `setZoomLevel` all three change.

Two ratchets were BEATEN rather than raised to fit this: `src/main/menu.js`
123→114 and `src/main/window.js` 74→69.

## 4. Not started

- **`/validate`** and the token-usage figure.
- `docs/brand/roadmap.svg` deliberately not touched — see step 18 in `plan.md`.

## 5. E2E status

Run natively on the Mac, `--workers=1`:

| spec | result |
|---|---|
| `toolbar-width` (7) · `toolbar-view-menu` (8) · `view-toggles` (5) | all green |
| `diagram-diff` (5) · `csv-grid` (4) · `diff-panes` (3) · `ui-affordances` (14) | all green |
| `tabs` · `tooltips` · `saved-diff` · `copy-diff` · `diff` · `sidebar-collapse` | all green |
| `json.spec.mjs` | 7/9 — the 2 reds are `openMenu` → `.menubar`, **macOS-structural**, not this change |

The full suite has NOT been run; `make e2e` in the container is the real gate.

## 6. How to run things

```sh
npm run check                       # everything
npm run build                       # REQUIRED before any e2e — they run the build
env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/toolbar-view-menu.spec.mjs --workers=1
```

`env -u ELECTRON_RUN_AS_NODE` is not optional — the agent shell exports it and
Electron then runs as plain Node (the tell is `Process failed to launch!`).
`--workers=1` is required on macOS: `workerEnv.mjs` throws for a second worker
because `DISPLAY` is X11-only.

## 7. Traps already paid for — do not re-introduce

- **`.options` must not shrink-wrap**, and never `justify-content: flex-end` —
  an end-justified row spills overflow BACKWARDS where `scrollWidth` cannot see
  it. It is `flex: 1; min-width: 0` with the auto margin on its FIRST CHILD.
- **No parked "ghost" trigger.** It scrolled the document sideways by 18px at
  every size. Both the trigger and the compact rung are sized from `--control-h`.
- **Widths are measured ONLY while the row is labelled.** A folded control
  measures 0 and a compact one measures `--control-h`; either would overwrite
  the labelled widths and the row could never earn its words back. The unit test
  that guards this was written once, found to pass without the guard, and
  rewritten until it failed for the right reason.
- **Every width includes its trailing gap**, so controls, budget and trigger are
  all in the same units. The gap was 0 while trap 2 in §3 was live, which is why
  the arithmetic looked right.
- **The popover surface is `--bg-elevated`, never `--bg-raised`**, and its 1px
  `--border` is load-bearing: `--shadow-rgb` is `0 0 0` on all seven dark themes.
- **An unavailable popover row carries its REASON in its accessible name.** So
  `getByRole('checkbox', { name: /Diagram/i })` also matches "Focus on
  changes — Focus applies to a diagram comparison". Anchor these: `/^Diagram$/i`.
- **`aria-label` carries the label at every rung**, which is what keeps ~40
  existing e2e selectors working when the word stops being drawn. Do not make it
  conditional.
- **Monaco's default font size is platform-specific** (`isMacintosh ? 12 : 14`).
  Never hardcode a base for the zoom — read the resolved size back from the
  editor once. A constant looks right on the Mac and shrinks every diff on Linux
  and Windows.
- **Never edit `src/` while `make e2e` is running.** `test:e2e` is
  `electron-vite build && playwright test`, so an edit mid-build produces a
  half-written bundle and EVERY spec then times out at 30s. One full run was
  thrown away to this.
