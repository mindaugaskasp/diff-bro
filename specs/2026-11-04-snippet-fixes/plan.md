# Snippet fixes

|                                         |                                                              |
| --------------------------------------- | ------------------------------------------------------------ |
| **Status**                              | shipped                                                      |
| **Progress**                            | 0 / 15 steps                                                 |
| **Branch**                              | `fix/snippet-fixes`                                          |
| **Issue**                               | #233                                                         |
| **Started**                             | 2026-11-04                                                   |
| **Finished**                            | —                                                            |
| **Bugs found and fixed this iteration** | 0 / 11                                                       |
| **Token baseline**                      | 2026-11-04T11:57:57Z                                         |
| **Claude tokens used**                  | 89,717,462 processed, from the build start (see Token usage) |

## Problem

Eight defects and gaps in the snippet document and the sidebar, reported together:

1. **Template tags footer is dead.** `TemplateTagsPopover` is mounted for every non-Mermaid
   snippet (`SnippetStatusBar.vue:41`, `acceptsFills`), opens only on hover
   (`useHoverReveal`), and its `position: absolute` popover is clipped by
   `.es-side:first-child { overflow: hidden }` (`SnippetStatusBar.css:22-25`, #153). The
   e2e passes because `toBeVisible` ignores ancestor clipping.
2. **A dropped file overwrites the snippet.** `SnippetDocument.vue:81-84` sets
   `content.value = text`; Monaco's `setValue` drops the undo stack. Format/Repair
   (`useSnippetDraft.formatContent`) replaces content wholesale too, with no confirm.
3. **Multi-tag items repeat.** `buildTagTree` (`utils/tagTree.js:61`) places an item under every
   tag it carries. That was a recorded decision (minimalist-redesign plan:272); some users want
   each item listed once.
4. **An unsaved Jira/Markdown snippet never shows the Rendered editor.**
   `useSnippetEditorView.js:16` sets `plain = ref(editMode.value)`, and `editMode` is true for
   every unsaved snippet. Only `onSaved` (`SnippetDocument.vue:37-43`) clears it.
5. **Edits are lost and history is hidden.** There is no autosave; `useSnippetDraft.save` is the
   only path. History opens only from the clock button (`SnippetEditorActions.vue:146-154`),
   which needs `history.length > 0`. The "…" menu (`menuItems`, 60-82) has no History item.
6. **Re-picking a row colour does nothing.** `setSnippetColor` returns early when the colour is
   unchanged (`stores/snippetMarks.js:11-23`).
7. **Changing the data folder restarts with no warning.** `datadir:choose` / `datadir:reset`
   (`src/main/appData.js`) move the data at once; `StorageSettings.vue:24-41` then calls
   `relaunch()` (`app.exit(0)`) without saving the session or checking unsaved snippet tabs.
8. **The toolbar jumps.** The snippet toolbar is right-aligned and History/Compare come and go, so
   Present/Compare/Copy shift 36 px (measured); the unsaved dot widens a tab 13 px.
9. **Mermaid view mode jumps.** `.dg-drift` (`DiagramDiffViewer.vue:151`) shows only when split, so
   turning Split view off moves the diagram up 27 px.
10. **The new-tab + is too flat**: dim ink and a divider, no edge (`DiffTabBar.css:175`).
11. **The tag list is hard to find.** `useTagScopeSearch.js:11-12` opens the scope list only when
    the query starts with `#`; the input has no focus or click handler.

## Solution

| #   | change                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mount the control only when `fillVars(language, content).length > 0`. Drop the clipping (the side keeps its ellipsis on the text span, not the container). The trigger toggles the popover on click; hover still reveals it.                                                                                                                                                       |
| 2   | The editor drop handler reads the file and opens it through the existing open-file-as-snippet path (a new draft tab). Format/Repair on a saved snippet asks first through a `BaseDialog` confirm; the new content goes in through a Monaco edit, so Cmd+Z undoes it.                                                                                                               |
| 3   | New setting `nestMultiTag` (Settings ▸ Behaviour, default off). With it on, `buildTagTree` places an item once, under the path formed by its in-scope tags sorted alphabetically (A ▸ B). Favourites and Untagged are unchanged.                                                                                                                                                   |
| 4   | `plain` starts true only for a non-preview syntax. Switching syntax to Jira/Markdown sets `plain = false`. The footer toggle is unchanged.                                                                                                                                                                                                                                         |
| 5   | `useSnippetAutosave`: every 5 s, if a saved snippet's draft is dirty and saveable, save it without leaving edit mode or re-masking. History: `update` gains a `{ session }` option; an autosave records a version only on the first save of an editing session. "…" gains History for every saved snippet; the panel opens with only the current version when there is no history. |
| 6   | `SnippetColorMenu.pick` passes `null` when the chosen colour equals the current one. The store contract is unchanged.                                                                                                                                                                                                                                                              |
| 7   | In main, between the picker returning and `setDataDir`, a native `showMessageBox` ("App will restart to change file location", detail = the folder, Proceed / Cancel), and before `datadir:reset` too. The renderer first runs the app-update guard (block on dirty snippet tabs, `tabs.saveSession()`).                                                                           |
| 9   | The snippet toolbar renders a fixed set: History is always present on a saved snippet, disabled with no versions. The unsaved dot replaces the tab's × (× on hover), so a tab never changes width.                                                                                                                                                                                 |
| 10  | The layout note moves from the `.dg-drift` band into the status band, so neither mode adds a row above the diagram.                                                                                                                                                                                                                                                                |
| 11  | `.diff-tabs .add` becomes a `--control-h-sm` square with a `--btn-edge` keyline, `--radius-sm`, and the + in `--text`.                                                                                                                                                                                                                                                             |
| 8   | Focusing or clicking the input with an empty query opens the scope list with every tag. Typing keeps it open and filters it as the rows filter. Escape and blur close it.                                                                                                                                                                                                          |

| option                                    | why not                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Remove the template tags control          | rejected by the user; it is useful when fill-ins exist                      |
| Confirm before every Format               | noise on a new draft; the user chose saved-only                             |
| Combined "A + B" group, or first tag only | the user chose nesting A ▸ B                                                |
| Autosave new drafts as "Untitled …"       | the user chose saved snippets only                                          |
| A history version per autosave            | 20-version cap fills within minutes                                         |
| Renderer-only data-folder confirm         | the move happens inside `datadir:choose`, so a confirm after it is too late |

## Scope

**In:** the eight items above.

**Out:** Quick Look edit staleness for an open tab of the same snippet (found while mapping item 2,
separate bug); a Restore button in history; autosave for new drafts; colour marks on saved diffs.

## Design

**Source of truth:** https://claude.ai/artifact/B1EPXQRuV1m4z2vbmQs9ZE (canvas, two pages).
**Approved design:** its "Approved design" page (launch page), rendered on the live app by
`design/render/233-snippet-fixes.render.mjs`, light and dark. Signed off by the user 2026-11-04.

| artboard                | shows                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| 1. Template tags        | today: clipped popover on every snippet → hidden without fill-ins → open, unclipped     |
| 2. Drop and Format      | a dropped file in a new tab, the original intact; the Format confirm on a saved snippet |
| 3. Tag nesting          | today's duplicate row → listed once under kubernetes ▸ prod; the Behaviour toggle       |
| 4. Rendered drafts      | an unsaved Jira snippet in Plain → Rendered                                             |
| 5. Autosave and history | editing a saved snippet; History in "…"; the panel with no earlier versions             |
| 6. Colour reset         | the menu with Green on → re-clicking Green clears it                                    |
| 7. Data location        | Storage today; the native "App will restart to change file location" confirm (drawn)    |
| 8. Search tags          | focus shows nothing today → the tag list on focus → narrowed while typing               |

Every visible change reuses a shipped component and its tokens:

| change                                    | reuses                                                    |
| ----------------------------------------- | --------------------------------------------------------- |
| template tags shown/hidden, popover opens | `TemplateTagsPopover` as shipped                          |
| Format confirm                            | `BaseDialog`, `.btn-ghost` Cancel + `.btn-primary` Format |
| nested tag groups                         | `TagSection`, already recursive for `a/b` tag paths       |
| Behaviour toggle                          | `SettingToggle` + `.hint`, as `showRowTags`               |
| History in "…"                            | an `ActionMenu` item with the `clock` icon                |
| data-folder confirm                       | native `showMessageBox`, as in `links.js`                 |
| tag list on focus                         | `.scope-list` as shipped                                  |

### Theme verdict

No new colour, token or CSS rule except removing `overflow: hidden` from one container. The verdict
is the existing one for each reused component. `make theme-sweep` runs on the opened template-tags
popover and the nested tag section during validation.

## Security rules touched

- **Rule 7 (sandbox exits):** the data-folder path is still computed in main; the confirm adds no
  `openExternal` or path from the renderer.
- **Rule 1:** no network.
- **Rule 3:** the drop reads the file through the existing `readFile` IPC.

No crypto, no new dependency, no new IPC handler.

## Test plan

Each bug's test is watched failing first.

- **unit**
  - `tests/renderer/utils/templateVars.test.js`: visibility predicate.
  - `tests/renderer/utils/tagTree.test.js`: `nest` places an item once, under the sorted path.
  - `tests/renderer/composables/useSnippetEditorView.test.js`: an unsaved Jira snippet is rendered.
  - `tests/renderer/composables/useSnippetAutosave.test.js` (fake timers): saves a dirty saved
    snippet at 5 s, never a new draft, never while saving, stays in edit mode.
  - `tests/renderer/stores/snippetStore.test.js`: one history version per session.
  - `tests/renderer/composables/useTagScopeSearch.test.js`: focus opens, typing filters,
    Escape closes.
  - `tests/main/appData.test.js`: Cancel leaves the pointer untouched; Proceed moves.
- **e2e**
  - `snippet-status-bar.spec.mjs`: the popover is hit-testable (`elementFromPoint`), not just
    `toBeVisible`.
  - `snippet-drop.spec.mjs` (new): a drop opens a second tab and the first keeps its content.
  - `snippet-colour.spec.mjs`: re-clicking the current colour clears it.
  - `snippet-history.spec.mjs`: History from "…" on a snippet with no versions.
  - `tag-tree.spec.mjs`: nesting toggle; focusing search shows `.scope-list`.
- **seed fixtures:** none; no data shape changes.

## Docs impact

| surface                  | needed? | what changes                                             |
| ------------------------ | ------- | -------------------------------------------------------- |
| `README.md`              | yes     | snippet feature list gains autosave and nested tags      |
| `docs/screenshots/*.png` | no      | none of the five captured states shows these surfaces    |
| `docs/roadmap.md`        | no      | fixes, not a track                                       |
| `docs/brand/roadmap.svg` | no      | same                                                     |
| `docs/*.md`              | yes     | `glossary.md` gains "editing session" (the history unit) |

## Delivery

One branch, as the user asked; the git-spice stack is not used for this change.

| #   | slice     | branch              | base   | PR  | status |
| --- | --------- | ------------------- | ------ | --- | ------ |
| 1   | all eight | `fix/snippet-fixes` | `main` |     |        |

## Implementation plan

- [x] 1. Template tags: visibility, unclip, click toggle (red e2e + unit first).
- [x] 2. Colour reset on re-pick (red e2e first).
- [x] 3. Rendered editor for unsaved Jira/Markdown (red unit first).
- [x] 4. Search focus opens the tag list (red unit first).
- [x] 5. Drop opens a new snippet tab (red e2e first).
- [x] 6. Format/Repair confirm on saved snippets, undoable edit.
- [x] 7. `nestMultiTag` setting and `buildTagTree` nesting (red unit first).
- [x] 8. Autosave composable plus per-session history (red unit first).
- [x] 9. History item in "…" (red e2e first).
- [x] 10. Data-folder confirm in main plus the renderer unsaved-tab guard (red unit first).
- [x] 13. Toolbar fixed slots and the dot in the × place (red e2e: button x and tab width stay put).
- [x] 14. Mermaid note in the status band (red e2e: `.dg-stage` top stays put across Split view).
- [x] 15. The + keyline (theme sweep probe added).
- [x] 11. Catalogue strings, `en-XA` regenerated, README and glossary.
- [x] 12. `/validate`, `npm run check`, the e2e specs touched, `make theme-sweep`.

## Decisions

| date       | decision                                                      | why                                                                   | rejected                                         |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 2026-11-04 | Template tags shown only when fill-ins exist                  | the user: hide unless used                                            | remove it; keep it everywhere                    |
| 2026-11-04 | Drop opens a new tab; Format confirms only on a saved snippet | the user                                                              | confirm every Format; undo only                  |
| 2026-11-04 | Optional nesting A ▸ B, default off                           | the user; reverses minimalist-redesign:272 only when on               | "A + B" group; first tag only                    |
| 2026-11-04 | Unsaved Jira/Markdown opens Rendered                          | the user                                                              | remember the last view                           |
| 2026-11-04 | Autosave saved snippets only, every 5 s                       | the user                                                              | autosave new drafts as Untitled; only once named |
| 2026-11-04 | One history version per editing session                       | protects the 20-version cap                                           | every autosave; at most every 5 min              |
| 2026-11-04 | History in "…" for every saved snippet                        | the user                                                              | only with versions; replace the clock button     |
| 2026-11-04 | Data-folder confirm after the pick, in main                   | the move runs inside the handler                                      | before the picker                                |
| 2026-11-04 | Typing keeps the tag list open and filters it                 | the user                                                              | typing closes it                                 |
| 2026-11-04 | 9: fixed toolbar slots; the dot takes the × place             | the user (options board 9a A, 9b A)                                   | —                                                |
| 2026-11-04 | 10: the layout note goes to the status band                   | the user (10 B)                                                       | keep the band with its own note                  |
| 2026-11-04 | 11: keyline +, on `--btn-edge`                                | the user (11 B); `--border` is 1.24–1.7:1 on the panel on most themes | soft face; ink only                              |
| 2026-11-04 | One branch for all eight                                      | the user asked for a single branch                                    | git-spice stack                                  |

## Validation

- [x] Comment sweep over the diff: every added comment is a single why-line.
- [x] `npm run check`: lint, style tokens, theme depth, structure, i18n, raw text, unit tests
      with coverage (95.56 % statements / 88.84 % branches / 96.31 % functions / 96.6 % lines),
      build. All green.
- [x] Red → green: every new unit test failed first; the ten new e2e tests failed on a build of
      the unchanged source (`git stash push -- src/`), and pass now.
- [x] `make e2e`: 769 passed, 9 failed, 4 skipped on the first run. The nine failures were the + button shrinking the top bar (fixed with vertical margin) and specs written for the old
      behaviour (Plain-first drafts, always-on template tags). The 57 tests in those 8 specs
      pass after the fixes.
- [x] `make theme-sweep`: 5259 measurements across 20 themes, ok, with `new-tab +` (4.5) and
      `new-tab keyline` (3:1) added to the snippet-tab surface. Parsed: the keyline is 3.21 at
      its lowest (sepia).
- [x] Item 7 was missed in the first pass and built after: `tests/main/appData.test.js`
      (Cancel moves nothing, Proceed moves, Use default asks) and `useDataDirMove.test.js` went
      red → green; `e2e/data-folder.spec.mjs` fails on the old main (the app restarts) and passes.
- [x] Docs-impact "yes" rows done.
- [x] Token usage measured (below).

### Token usage

`token-usage.mjs --since 2026-11-04T11:57:57Z`, run in a `--network none` container with
`~/.claude/projects` mounted read-only (the host has no Node). 244 requests, 11:57–14:37 UTC.

| category    |         tokens |
| ----------- | -------------: |
| input       |            514 |
| output      |        137,042 |
| cache write |        968,614 |
| cache read  |     88,611,292 |
| **total**   | **89,717,462** |

The window opens at the branch, so the issue, grilling, canvas and option renders before it
are not counted.
