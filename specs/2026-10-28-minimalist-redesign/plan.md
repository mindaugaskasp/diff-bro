# Minimalist redesign of the whole app (with #121 and #142)

|                                         |                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                              | in-progress                                                                                                                                                                                                                                                                                                   |
| **Progress**                            | 2 / 11 slices merged; slice 3 in progress                                                                                                                                                                                                                                                                     |
| **Branch**                              | one per slice, `improvement/redesign-<slice>`; see Delivery                                                                                                                                                                                                                                                   |
| **Started**                             | 2026-10-28                                                                                                                                                                                                                                                                                                    |
| **Finished**                            | —                                                                                                                                                                                                                                                                                                             |
| **Bugs found and fixed this iteration** | 3 / 3 — slice 1: Cmd/Ctrl+Enter from the sheet opened "Untitled" (`diffStore.test.js`); slice 3: a stitched capture failed whole when its last strip came out under main's 32px minimum (`captureTarget.test.js`), and the active tab was left half hidden when the track narrowed (`useTabOverflow.test.js`) |
| **Token baseline**                      | 2026-10-28T16:47:21Z                                                                                                                                                                                                                                                                                          |
| **Claude tokens used**                  | —                                                                                                                                                                                                                                                                                                             |

## Problem

Issue #144. The app reads as bloated, measured on the live app on 2026-10-28
(`design/render/today.render.mjs`):

1. Four stacked bands sit above any content: the menu bar, the toolbar, the tab
   strip and the file slots. Together they take about 150px.
2. Every button has a face veil, a keyline and a shadow (`ui.css` `.btn`), so a
   toolbar of six actions reads as a row of boxes.
3. Toolbar actions are all labelled and all the same weight.
4. The sidebar's top is a tinted search band, a tag shelf, a section header with
   four icon actions, and then the Mine and Received tabs.
5. Every row has a tinted monogram well and an age.
6. A snippet document has three bands before its text: a boxed name with the
   Secret toggle; a Content band with the drop hint, Format, Syntax and
   "→ plaintext"; then the text.
7. A comparison has a floating shortcut-hint bar and a tall status band.
8. Tools shows twelve bordered tiles, and Home repeats four of them.
9. The empty comparison shows cards with icon wells, key chips and a format
   list.
10. A dialog is a bordered panel with a description line and boxed fields. The
    tool window scrolls as a whole, which pushes its buttons out of view.
11. Headings, section titles and labels are bold everywhere.
12. Quick Look-up (#142) grows itself to compose (692×452 → 960×720,
    `src/main/quickLookCore.js`), and is busy with bands and hints.

Folded in, from #121, which has its own Approved design: Claude proposals are
easy to miss (they appear on Home only), and snippets are grouped only by a flat
tag filter.

## Solution

An Apple-inspired, minimalist pass over every surface. Components keep their
structure unless a decision moves them. Every decision below was chosen on the
canvas from options rendered on the live app.

| option                                       | why not                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| Soft or hairline controls (Q1 B, C)          | still a row of shapes; Plain was chosen                       |
| Merged toolbar, but the menu bar kept (Q2 A) | leaves two bands on Windows and Linux                         |
| Quiet sidebar with a rail (Q3 A, B)          | the user chose to remove the rail                             |
| Document controls on one band (Q4 A)         | Syntax as underlined text in the footer was chosen            |
| Quiet slot band (Q5 A)                       | the user chose to remove the band                             |
| Quiet start list (Q6 A)                      | the minimal prompt was chosen                                 |
| Plain list for Tools (Q7 A)                  | the icon grid was chosen                                      |
| Light weights (Q9)                           | headings lose their hierarchy in dark themes                  |
| Curated themes (Q10)                         | removes themes people use                                     |
| Quick Look side by side (Q11 A)              | single column, with a small editor and no preview, was chosen |

## Scope

**In:**

- every surface named in the Problem;
- #121's proposals, nested tag sections and `#` search, for Snippets and Diffs;
- #142, Quick Look-up;
- `docs/standards.md` rules that the decisions change;
- `check:themes` and the theme sweep, wherever their floors measure the old
  look;
- screenshots and docs.

**Out:**

- new features beyond #121;
- new dependencies;
- removing any theme;
- removing secret snippets (only their toggle moves).

## Design

**Source of truth:** https://claude.ai/artifact/Qed2FCbTtcWswSLRpJUik5. Pages
Q1–Q11 hold every option, rendered on the live app.
**Approved design:** its "Approved design" page, signed off by the maintainer on
2026-10-28. #121's own Approved design
(https://claude.ai/artifact/ReLRBD24djMWoNHR2F7DKx) is folded in.
**Renders:** `design/render/redesign.render.mjs` (variant `final`),
`design/render/quicklook.render.mjs` (variant `list`) and
`design/render/121-proposals.render.mjs`.

| artboard                              | shows                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Library and documents · snippet       | quiet sidebar, segmented control, From Claude group, tag tree, `#` search, name + tags head, Syntax in the footer, narrow gutter |
| Library and documents · comparison    | one row of tabs and icon actions, no slot band, pane labels, slim footer                                                         |
| Starting · start                      | minimal prompt and three text links                                                                                              |
| Starting · waiting                    | the waiting pane chooses the second file                                                                                         |
| Home and Tools                        | icon grid, no cards                                                                                                              |
| Dialogs · JSON tool / Settings        | sheet, quiet fields, pinned actions, no dialog scroll                                                                            |
| Quick Look · results / edit / compose | Spotlight style, single column, 760×480, compact sheet editor                                                                    |

**Tokens:**

- The controls use `--btn-rest-face` and `--btn-rest-edge`, transparent at rest,
  with the hover ladder kept (`--btn-face-hover`, `--btn-face-press`). Only
  `.btn-primary` is filled.
- Type is a new stack, `-apple-system, 'Segoe UI', system-ui, sans-serif`, at
  13px for `--font-md`, 12px for `--font-sm` and 11px for `--font-xs`. Weights
  are 600 for titles and headings, 500 for tool and tab labels, and 400 for
  rows.
- Proposals use `color-mix(--hue-received 70%, --text)` for the keyline,
  `--glyph-received` on `--well-received` for the glyph, and white on
  `--hue-received` for the count badge.

### Theme verdict — all 20

All 20 rendered on the live app and measured on the DOM (`ALL_THEMES=1`,
`design/render/overlays/measure.mjs`): every probe passes. The tightest are nord's
proposal keyline (3.33), solar and meridian's primary label (4.52–4.53) and meridian's
segmented selection (1.19). See the canvas page "Themes · all 20". Slice 1 rewrites the control floors, and each slice is held to
`check:themes` and the theme sweep on all 20 before its PR.

| theme    | ground | verdict | note                                               |
| -------- | ------ | ------- | -------------------------------------------------- |
| light    | light  | pass    | floating-canvas inversion kept                     |
| dark     | dark   | pass    |                                                    |
| solar    | light  | pass    |                                                    |
| neon     | dark   | pass    | accent `#22d3ee`: no glows used                    |
| nord     | dark   | pass    | proposal keyline 3.33 (worst), above the 3:1 floor |
| sepia    | light  | pass    | glyph on well 6.13 (worst)                         |
| dim      | dark   | pass    |                                                    |
| beacon   | dark   | pass    | hard keyline kept on buttons, fields and dialogs   |
| meridian | light  | pass    |                                                    |
| linen    | light  | pass    |                                                    |
| bloom    | light  | pass    |                                                    |
| nyan     | dark   | pass    | accent `#ff2ecb`: no glows                         |
| matrix   | dark   | pass    | accent `#00ff41`: no glows                         |
| contrast | light  | pass    | hard keyline kept on buttons, fields and dialogs   |
| volcano  | dark   | pass    |                                                    |
| amber    | dark   | pass    |                                                    |
| tide     | dark   | pass    |                                                    |
| ember    | dark   | pass    |                                                    |
| graphite | dark   | pass    |                                                    |
| vector   | light  | pass    |                                                    |

## Security rules touched

- **Rule 1 (offline):** nothing changes. The System theme reads
  `nativeTheme`, which is local.
- **Rule 3 (renderer/main):** the System theme is read in main and exposed
  through a validated IPC read. The renderer imports no Electron.
- **Rule 7 (sandbox exits):** none added.
- **#121's MCP change:** a tag path deeper than 3 levels is refused at the
  `mcpInput.js` check, which is stricter validation. Claude still only proposes,
  secret snippets are still never shared, and accepting stays a user act.
- No crypto changes and no new dependency.

## Test plan

Written before the code. One failing test first in every slice.

- **unit:**
  - `tests/renderer/utils/tagTree.test.js`: a nested tree from tag paths;
    counts include descendants; a fourth level is refused.
  - `tests/main/mcpInput.test.js`: a tag deeper than 3 levels is an
    `InputError`.
  - `tests/main/quickLookCore.test.js`: one size for every mode.
  - The System theme follows `nativeTheme`.
  - The settings default is `system`.
- **e2e:**
  - `e2e/redesign-chrome.spec.mjs`: one row; the ≡ menu reaches every menu.
  - `e2e/segmented-nav.spec.mjs`: each segment opens its panel; Keys is
    reachable from ≡.
  - `e2e/claude-proposals.spec.mjs`: the From Claude group, Select, bulk
    accept, the proposed tab, and editing before accept.
  - `e2e/tag-tree.spec.mjs`: nested sections, `#` search and the scope chip.
  - `e2e/doc-syntax-footer.spec.mjs`: the footer picker changes the language.
  - `e2e/comparison-noslots.spec.mjs`: open, replace and swap without the
    band.
  - `e2e/tool-dialog-size.spec.mjs`: every tool dialog is the same size, and
    its actions stay in view.
  - `e2e/quick-look-fixed.spec.mjs`: the size never changes; opening a snippet
    shows the small editor; the ← button returns to the results; Esc closes the
    launcher from anywhere; the ← key never navigates.
- **Specs that find elements by the old chrome** are updated in the slice that
  moves them.
- **Theme sweep:** `SURFACES` gains each new surface.
- **seed fixtures:** none (no new format).

## Docs impact

| surface                  | needed? | what changes                                                                                                             |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | yes     | the features list and screenshots' alt text describe the new layout                                                      |
| `docs/screenshots/*.png` | yes     | every captured frame changes; regenerate with `make screenshots`                                                         |
| `docs/roadmap.md`        | yes     | the redesign, #121 and #142 move to done                                                                                 |
| `docs/brand/roadmap.svg` | yes     | the same move                                                                                                            |
| `docs/standards.md`      | yes     | the control rule (Plain), the type scale and weights, dialogs, the sidebar rules (band rows), and the canvas kit routine |
| `docs/features.md`       | yes     | navigation (segmented control, ≡ menu), tag tree, `#` search, Quick Look                                                 |

## Delivery

One PR per slice, stacked with git-spice. Slice 1 targets `main`, and each
later slice targets the one below it. Each slice is green on its own; the stack
merges bottom-up and ships as one tag.

| #   | slice                                                                                                                                                | branch                              | base   | PR   | status      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------ | ---- | ----------- |
| 1   | Quick Look-up: Spotlight, single column, fixed size, compact sheet editor, Esc-only (#142)                                                           | `improvement/redesign-quicklook`    | `main` | #145 | merged      |
| 2   | Foundation: font stack and scale, plain controls (keylines kept on contrast and beacon), refined weights; the standards and `check:themes` rewritten | `improvement/redesign-foundation`   | 1      | #148 | merged      |
| 3   | Chrome: one row, ≡ menu, icon-only actions (icons for Copy and Compare with…)                                                                        | `improvement/redesign-chrome`       | 2      |      | in progress |
| 4   | Navigation: segmented control instead of the rail; Keys in ≡; quiet sidebar                                                                          | `improvement/redesign-nav`          | 3      |      |             |
| 5   | #121 proposals: From Claude group, ✦ counts, Select, proposed tab and bar, editable, Home block removed, comparisons too                             | `improvement/redesign-proposals`    | 4      |      |             |
| 6   | #121 grouping: nested tag sections (Snippets and Diffs), shelf removed, reorder within a section, `#` search, MCP depth check                        | `improvement/redesign-tag-tree`     | 5      |      |             |
| 7   | Document: name and tags head, Syntax in the footer, Format in ⋯, Secret in the row menu, narrow gutter                                               | `improvement/redesign-document`     | 6      |      |             |
| 8   | Comparison: no slot band, pane labels, no hint bar, slim footer, minimal empty state, waiting pane chooser                                           | `improvement/redesign-comparison`   | 7      |      |             |
| 9   | Panels: icon grid for Tools and Home                                                                                                                 | `improvement/redesign-panels`       | 8      |      |             |
| 10  | Dialogs: sheet and quiet fields, one tool size, pinned actions                                                                                       | `improvement/redesign-dialogs`      | 9      |      |             |
| 11  | Themes: System default following the OS                                                                                                              | `improvement/redesign-system-theme` | 10     |      |             |

## Implementation plan

- [x] 1. Slice 1, Quick Look-up: tests red; fixed 760×480 card; one column, no preview; compact sheet editor (← back, name, Save; language in the footer); Esc leaves from anywhere, the ← key never navigates; Cmd/Ctrl+Enter opens in the main window (the sheet saves first); `--field-edge`; e2e; PR.
- [x] 2. Slice 2: tests red; tokens and `ui.css`; standards; `check:themes` floors; sweep; e2e; PR.
- [ ] 3. Slice 3: tests red; the toolbar moves into the tab row; ≡ menu; icons; specs; sweep; PR.
- [ ] 4. Slice 4: tests red; segmented control; Keys in ≡; quiet sidebar; specs; PR.
- [ ] 5. Slice 5: #121 proposals; sparkle icon; specs; PR.
- [ ] 6. Slice 6: tag tree utility and component; `#` search; MCP check; specs; PR.
- [ ] 7. Slice 7: document head, footer picker, gutter; specs; PR.
- [ ] 8. Slice 8: comparison and empty and waiting states; specs; PR.
- [ ] 9. Slice 9: icon grid; specs; PR.
- [ ] 10. Slice 10: dialogs (quiet fields via `--field-edge`); tool size; pinned actions; specs; PR.
- [ ] 11. Slice 11: System theme; specs; PR.
- [ ] 12. Docs: screenshots, README, features, roadmap and its SVG.
- [ ] 13. Validate; merge bottom-up; tag.

## Decisions

| date       | decision                                                                                                                                                                                                                                                      | why                                                                                                                                                                 | rejected                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 2026-10-28 | Q1 Plain controls                                                                                                                                                                                                                                             | the most Apple-like; the user chose it                                                                                                                              | soft, hairline, today                  |
| 2026-10-28 | Q2 one row, ≡ menu, icon actions, Save labelled                                                                                                                                                                                                               | two bands become one                                                                                                                                                | merged with the menu bar kept          |
| 2026-10-28 | Q3 no rail; segmented control; Keys in ≡                                                                                                                                                                                                                      | the user chose it                                                                                                                                                   | quiet rail                             |
| 2026-10-28 | The redesign carries #121's tree, `#` search and proposals                                                                                                                                                                                                    | the user asked                                                                                                                                                      | separate                               |
| 2026-10-28 | Q4 name and tags head; Syntax as underlined text in the footer, a picker on click                                                                                                                                                                             | the user asked                                                                                                                                                      | one band with tools                    |
| 2026-10-28 | The Secret toggle leaves the document; the feature stays (set from the row menu)                                                                                                                                                                              | the user chose it                                                                                                                                                   | removing the feature                   |
| 2026-10-28 | Q5 no slot band; pane labels                                                                                                                                                                                                                                  | the user chose it                                                                                                                                                   | quiet slots                            |
| 2026-10-28 | Q6 minimal empty state                                                                                                                                                                                                                                        | the user chose it                                                                                                                                                   | quiet list                             |
| 2026-10-28 | Q7 icon grid; narrow gutter                                                                                                                                                                                                                                   | the user chose it, and asked for the gutter                                                                                                                         | plain list                             |
| 2026-10-28 | Q8 sheet and quiet fields; one tool size; no dialog scroll                                                                                                                                                                                                    | the user chose it and asked for both rules                                                                                                                          | sheet only                             |
| 2026-10-28 | Q9 refined weights 600 / 500 / 400                                                                                                                                                                                                                            | macOS hierarchy                                                                                                                                                     | light, today                           |
| 2026-10-28 | Q10 keep 20 themes; add a System default                                                                                                                                                                                                                      | the user chose it                                                                                                                                                   | curate                                 |
| 2026-10-28 | Q11 Quick Look: Spotlight, single column, no preview, a small editor on open, fixed 760×480                                                                                                                                                                   | the user asked                                                                                                                                                      | side by side                           |
| 2026-10-28 | The design font app-wide (#121 Q9), folded into slice 1                                                                                                                                                                                                       | one foundation                                                                                                                                                      | separate issue                         |
| 2026-10-28 | Approval is given on renders of the live app, not mockups                                                                                                                                                                                                     | the user asked; routine in the implement skill                                                                                                                      | hand-drawn boards                      |
| 2026-10-28 | contrast and beacon keep the button keyline (`--btn-edge` stays there)                                                                                                                                                                                        | their hard-keyline contract, found by the all-themes check                                                                                                          | plain everywhere                       |
| 2026-10-28 | Q12: the Quick Look editor is a compact sheet (← back, name and Save in one header row; full-bleed body; language underlined in the footer)                                                                                                                   | the user chose it after the editor was flagged for refinement                                                                                                       | notes-style                            |
| 2026-10-28 | Quick Look keys: the ← button in the sheet header (and the tool panel's ← button) is the only way back to the results; Esc exits Quick Look entirely from anywhere, keeping an unsaved draft for the next summon; the ← key is a cursor key, never navigation | the user asked (refined twice on 2026-10-28)                                                                                                                        | Esc as back; ← key as back             |
| 2026-10-28 | Quick Look: Enter or a click on a snippet opens the editor sheet; Cmd/Ctrl+Enter opens it in the main window from the results and from the sheet (the sheet saves unsaved edits first); Save in the sheet is Cmd/Ctrl+S                                       | there's no preview pane; the main window stays reachable without a button                                                                                           | an icon in the sheet; no route at all  |
| 2026-10-28 | The inline tool panel keeps its ← back button; Esc exits Quick Look from it too                                                                                                                                                                               | the user's choice                                                                                                                                                   | removing it                            |
| 2026-10-28 | Quick Look ships as slice 1, ahead of the foundation                                                                                                                                                                                                          | the user asked                                                                                                                                                      | the original order                     |
| 2026-10-29 | Plain controls use new `--btn-rest-face` / `--btn-rest-edge` / `--btn-off-edge` tokens rather than setting `--btn-face` and `--btn-edge` to transparent                                                                                                       | about 35 other surfaces use those two as a selected face or a visible keyline; blanking them would erase segmented selections, theme-tile edges and callout borders | redefining `--btn-face` / `--btn-edge` |
| 2026-10-29 | The ≡ menu replaces the in-window menu bar on Windows and Linux only; macOS keeps its native bar and shows no ≡                                                                                                                                               | the native bar is already off-window there, so ≡ would duplicate it                                                                                                 | ≡ on every platform                    |
| 2026-10-29 | The action bar has two rungs: icons (Save keeps its word), then folded into ⋯. The tabs give ground first; actions fold only once the tabs are at their floor                                                                                                 | the labelled rung is gone by design; the tabs scroll, the actions do not                                                                                            | folding as soon as the tabs need room  |
| 2026-10-29 | View is the sliders glyph (with its count); Present, Compare with…, Copy, Show/Hide, History and Capture are glyphs; Copy confirms with a check glyph                                                                                                         | one icon language across the row                                                                                                                                    | a lone chevron for View                |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] `make e2e`, and the theme sweep on all 20 themes
- [ ] every Docs-impact "yes" done
- [ ] token usage measured
