# Pinned tools, hover that reads, Show in folder, one-file open, and one tool window

|                                         |                                 |
| --------------------------------------- | ------------------------------- |
| **Status**                              | approved                        |
| **Progress**                            | 5 / 5 slices built              |
| **Branch**                              | one per slice; see Delivery     |
| **Started**                             | 2026-10-24                      |
| **Finished**                            | —                               |
| **Bugs found and fixed this iteration** | 0 / 2                           |
| **Token baseline**                      | — (taken when the build starts) |
| **Claude tokens used**                  | —                               |

## Resume here

State on 2026-10-27: **design approved, building slice 1.** Tracked as
GitHub issue #92. Slices are sub-issues
#93–#97, each blocked by the one before it. Release
v0.13.0 shipped before this work started, so `main` holds nothing of it.

1. **Canvas approved** on 2026-10-27: the "Approved design" page of
   https://claude.ai/artifact/FA9kFwk7FtaEoeA5LvtcqQ.
2. **Build the stack** with git-spice (`git-spice`, never `gs`); the repo is
   already initialised and authenticated.
   - Slice 1 also carries this spec. Rebase this branch's commits into it, or
     merge this docs branch first.
   - Each slice is `git-spice branch create <branch from Delivery>`, failing
     test first, `npm run check`, then `git-spice stack submit --fill`.
   - Merge bottom-up once every PR is green: `git-spice downstack merge
--method squash --branch <top>`, `git-spice repo sync`, then one tag.
3. **Re-measure the theme verdict** with the sweep's new `hover` channel once
   slice 2 exists. The table above was computed offline by resolving
   `var()` and `color-mix(in srgb …)` from `themes.css` and `tokens.css`.

**Where each slice starts in the code:**

| slice            | start reading                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Pinned group   | `components/ToolTiles.vue`, `utils/toolGroups.js` (`TOOL_GROUPS`), `HomePanel.vue:55` for how Home does it                                                                                                   |
| 2 Hover          | `styles/ui.css` (`.tile` ~1191, `.btn` ~142), `styles/tokens.css` (`--btn-face*`, `--bg-card`), `scripts/theme-sweep.mjs` (`against()`, the `shadow`/`outline` channels) and `scripts/check-theme-depth.mjs` |
| 3 Show in folder | `src/main/dataFiles.js` (`STORE_NAMES`; files are `<name>.json`), `src/main/appData.js:157` (`datadir:reveal`), `SavedDiffRow.vue`, the snippet row, the preload                                             |
| 4 Open one file  | `src/main/index.js:50` (`open-file`), `utils/commands.js:170` (`openWithFromCli`), the snippet draft store, `e2e/open-with.spec.mjs` (`:47`, `:107` change)                                                  |
| 5 Tool window    | `TextToolDialog.vue:60`, `EncryptDecryptDialog.vue:97`, `settings.dialogSize`, `composables/useBackdropClose.js`, `src/main/window.js:49` and `:79`                                                          |

**Leave alone:** `e2e/.open-with.spec.mjs.swp` is the user's editor swap
file, untracked.

## Problem

Five reports from the user, 2026-10-24.

1. **A pinned tool moves on Home but not in Tools.**
   - Pinning (★) a tool puts it in Home's Pinned block (`HomePanel.vue:55`).
   - The Tools panel draws only the job groups (`ToolTiles.vue`,
     `TOOL_GROUPS`), so the pinned tool stays where it was.
   - The star turns on, but nothing else moves. One action means two
     different things in two places.
2. **Controls don't read as controls on hover.**
   - A `.tile` (Tools, Home cards) only steps its lift from `--shadow-1` to
     `--shadow-2` (`ui.css:1210`). On the dark grounds that step is close to
     invisible.
   - Text toggles (`.seg-opt`, `.whose-opt`) change only their ink.
   - `.btn` is fine: its face steps to `--btn-face-hover` and its keyline to
     `--accent` (`ui.css:142`).
   - The standard already says a control must read as one before it is
     touched. Hover is the confirmation, and here it is too faint.
3. **No way to find a saved item on disk.**
   - A saved diff or snippet row has no way to show where it is stored.
   - They are not files of their own. Each is one entry in an encrypted store
     file in the data directory (`vault`, `snippets`; `dataFiles.js`
     `STORE_NAMES`).
   - The only reveal today is Settings ▸ data folder (`datadir:reveal`,
     `appData.js:157`).
4. **Opening one file shows the start screen.**
   - "Open with Diff Bro", `diffbro open <file>` or a dropped single file
     goes through `open-file` (`index.js:50`) and the `open-with` command
     (`commands.js:170`, `openWithFromCli`).
   - The file fills the **left** pane, and the window shows the "waiting for
     the second file" start screen.
   - Opening one file usually means reading or editing it, not starting a
     comparison. The user has to look past a half-empty comparison to see it.
5. **Tool windows are different sizes.**
   - The text tools (`TextToolDialog.vue:60`) are fixed at `460px`.
   - Encrypt / Decrypt (`EncryptDecryptDialog.vue:97`) is `560px`, resizable,
     and remembers a size of its own (`settings.dialogSize('encrypt')`).
   - Encrypt also obeys the "maximize dialogs" setting, so it can fill nearly
     the whole window.
   - Moving between two tools changes the window under the user's hands.
   - Clicking outside closes Encrypt / Decrypt (`close-on-backdrop`) but not
     the text tools (`:close-on-backdrop="false"`, `TextToolDialog.vue:60`).
     The same gesture does two different things.

## Solution (to be drawn on the canvas, then approved)

- **Pinned first in Tools.** A **Pinned** group heads the Tools panel, in pin
  order, ahead of the job groups.
  - A pinned tool shows there, not also in its job group, so a pin moves the
    tile, the same as on Home.
  - Unpinning returns it to its job group.
  - The panel's search filters the Pinned group too.
- **A hover contract for every clickable surface.** Hover always changes two
  things: the **face** (`--btn-face-hover` or a `--bg-card` step) and the
  **edge or lift**. A shadow step alone is not a hover.
  - `.tile` gains a face step and a `--btn-edge` keyline on hover. The three
    hard-keyline themes already carry an edge.
  - Text toggles gain a `--btn-face` wash.
  - A new theme-sweep channel measures the hover delta, so a too-faint hover
    fails on whichever of the 20 themes it is faint on.
- **Show in folder on a saved diff or snippet row.** On a snippet row it is a
  row action beside Delete. A saved-diff row would carry five icons, which
  pushes the hover strip over the middle of the name, so there Export as image
  and Show in folder share a "More actions" menu (board 3c, option B). Main reveals, selected in the OS file manager, the
  **encrypted store file** that holds the item (`vault` for a diff,
  `snippets` for a snippet), not the folder of the original files.
  - `shell.showItemInFolder` takes a path **computed in main** from the
    `STORE_NAMES` allowlist. The renderer sends only `'vault'` or
    `'snippets'`.
  - That is a fourth reveal site under hard rule 7. It is fenced like the
    other three, and `docs/standards.md` gets the same paragraph.
- **One file opens as an editor, not half a comparison.** A single opened
  file becomes a **new, unsaved snippet tab**:
  - the name is the file name, and the syntax is detected from its extension;
  - the content is the file's text, in the snippet document already used for
    snippets (status bar, find, zoom);
  - nothing reaches the library until the user presses Save;
  - **Compare with…** in that document starts a comparison with the file on
    the left.
  - **Two or more files opened together** still open as a comparison, as
    today.
  - **A second file opened while the first is still open asks first.** If
    the snippet tab made from the previously opened file is still open, a
    prompt asks "Compare with <previous file>?":
    - **Compare** (primary): a comparison opens, previous file on the left,
      new file on the right; the previous tab stays as it was.
    - **Open as new tab**: the new file opens in its own snippet tab.
    - Escape or a click outside means **Open as new tab**, the choice that
      loses nothing.
    - No previous tab open (closed, or saved and closed): no prompt, a new
      tab.
  - A binary or oversized file is refused with the notice it gets today; it
    never becomes a snippet.
  - "Opened from <folder> · not in your library yet" is in the status bar.
- **The snippet head is one row and lines up with the sidebar** (board 4c,
  folded into slice 4 from the canvas note on 4a).
  - Name, tags and Secret share one 49 px row ending at 151, the sidebar's
    top band. The Content bar becomes a `.band-row` ending at 203, the
    sidebar's section head.
  - Tags that do not fit collapse into a "+N" chip that opens the full list.
  - "Saves as <resolved name>" is grey text inside the name field, in the
    existing `name-ghost` ink. It hides when the name leaves no room; the
    field's tooltip still says it. An empty name shows a red keyline and the
    message as the placeholder.
  - The comparison's file-slots row also ends at 151 (today 154).
- **One tool-window size.** Every tool panel, text tools and Encrypt alike,
  opens at one shared size.
  - `TOOL_DIALOG_SIZE` in `utils/tools.js`, 720 × 540 (canvas
    boards 5a and 5b).
  - It must fit the minimum window (1120 × 640, `window.js:49`) with the
    menu bar and margins showing. If the largest tool's content does not fit,
    the default window grows instead (today 1400 × 900, `window.js:79`).
  - All tool panels are resizable. One remembered size, `dialogSize('tool')`,
    replaces the per-tool `'encrypt'` key, with no migration (#113): the old
    size resets. Move between tools and the window stays put.
  - The "maximize dialogs" setting applies to every tool or to none.
  - Tool content flexes to the shared size. Short tools centre in it, and
    nothing scrolls at the minimum.
  - **Every tool closes on a click outside it,** through the existing
    `useBackdropClose` guard: the press must start and end on the backdrop,
    so a drag-select or resize that ends outside never closes it.
  - **The JSON tool colours JSON in its input and its output** (user,
    2026-10-27). The input stays a textarea with a highlighted mirror under
    it (`miniHighlight`, Prism tokens, the `--syn-*` roles), so it also works
    in Quick Look, which cannot carry Monaco. Every theme's `--syn-*` holds
    ≥ 5.85:1 on `--bg`.
  - **A tool keeps its last input for the session.** Closing by a click
    outside must not cost a long paste. Reopening the same tool restores
    what was typed. The input is renderer memory only, never persisted, so
    nothing a tool held survives a relaunch.

| option                                                     | why not                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pinned tools stay in their group, marked by the star alone | the user's report: a pin must move the tile, as it does on Home                                                            |
| Hover by shadow only, darker                               | the lift is the resting cue; on dark grounds `--shadow-2` cannot carry hover alone                                         |
| Show in folder opens the data folder (`openPath`)          | lands the user in a folder of a dozen files with nothing selected                                                          |
| One file keeps opening into the left pane                  | the user's report: the start screen is the wrong first view for one file                                                   |
| Text tools keep refusing a backdrop click                  | the user asked for one behaviour; closing everywhere plus session-kept input loses nothing                                 |
| Each tool sized to its content                             | the user's report: sizes changing between tools is the problem                                                             |
| Encrypt shrunk to 460px like the others                    | its two panes and options need the width; growing the others to one generous size serves every tool                        |
| One file opens in a read-only viewer                       | the user asked for the snippet or text editor view; a new snippet tab already has the editor and costs nothing until saved |

## Scope

**In:**

- Tools panel grouping;
- the hover states of `.tile`, `.seg-opt`, `.whose-opt`, `.rail-item`, row
  actions and Home cards;
- a reveal row action on saved-diff and snippet rows;
- single-file open (OS "Open with", `diffbro open <file>`, a single dropped
  file onto an empty window) as a new snippet tab;
- every tool panel (`TextToolDialog` cases and `EncryptDecryptDialog`) at one
  shared size, plus the default window size if needed.

**Out:**

- changing what a pin means on Home;
- a per-item file export;
- received diffs: their row already offers export;
- writing an edited file back to its original path. The tab is a snippet,
  and Save stores it in the library; saving to disk would be its own spec.

## Design

**Source of truth:** https://claude.ai/artifact/FA9kFwk7FtaEoeA5LvtcqQ, seven boards:

1. Tools ▸ Pinned group (today vs proposed).
2. The hover contract in all 20 themes.
3. Show in folder.
4. One opened file as a snippet tab, and the second-file prompt.
5. The text tool and Encrypt at the shared size in the minimum window.

**Approved design:** the "Approved design" page of the same canvas, signed
off by the user on 2026-10-27. Boards 1, 2, 3, 4a, 4b, 4c, 5a and 5b; the
decisions sticky repeats the Decisions table below.

- **Hover CSS:** `--tile-face-hover: color-mix(in srgb, var(--bg-card) 90%, var(--text))`.
  `.tile:hover` takes that face, a `--btn-edge-strong` border and `--shadow-2`.
  `.seg-opt:not(.on):hover` and `.whose-opt:hover` take `--btn-face`.
- **Tool window:** `TOOL_DIALOG_SIZE`, 720 × 540. In the
  1120 × 640 minimum that leaves 65 px above and below and 200 px each side.
  The default window (1400 × 900) already fits it, so it does not grow.

### Theme verdict — all 20

Measured by the theme sweep's `hover` channel on the live app, 2026-10-27.

| floor                            | holds on | lowest                                           |
| -------------------------------- | -------- | ------------------------------------------------ |
| tile face, rest → hover ≥ 1.15   | 20 / 20  | sepia 1.19, meridian 1.20                        |
| hovered tile edge ≥ 3:1          | 20 / 20  | nord 3.98                                        |
| toggle wash, rest → hover ≥ 1.15 | 20 / 20  | segmented: sepia 1.25; Mine/Received: sepia 1.26 |
| hovered toggle label ≥ 4.5       | 20 / 20  | segmented: nord 4.56; Mine/Received: nord 5.98   |

The offline estimate this replaced missed two nord failures, which the sweep
caught: `--btn-edge` on the hovered tile (2.6) and a `--btn-face-hover` wash
under the segment label (3.83).

- contrast, beacon and volcano keep their hard keyline; hover only steps it.
- The accent stays off every hover, so matrix, nyan and neon do not halo.

## Security rules touched

- **Rule 7, leaving the sandbox.** Show in folder adds a `showItemInFolder`
  call site.
  - The path is computed in main from the `STORE_NAMES` allowlist.
  - The renderer names a store, never a path.
  - It reveals that one file, never an arbitrary one.
  - `docs/standards.md` rule 7 and `docs/security.md` are updated in the same
    change.
- No new dependency, no network, no crypto change.

## Test plan

- **e2e, slice 1:** pinning a tool moves its tile into Tools ▸ Pinned, and
  unpinning returns it to its group. Red on `main` first.
- **e2e, slice 2:** a computed hover delta on `.tile`, measured, not
  screenshotted. Red first.
- **Theme sweep:** a `hover` channel. Each probe hovers its control and holds
  the face delta to a floor on all 20.
- **e2e, slice 3:** Show in folder calls `showItemInFolder` with the store
  path (stubbed in main). The handler rejects an unknown store name.
- **Unit:** the main-side path resolver, for an allowlisted name, an unknown
  name, and path traversal.
- **e2e, slice 4:** `open-with.spec.mjs` is rewritten.
  - One file opened from the OS opens a "New Snippet" region named after the
    file, holding its text, with no start screen. Red on `main` first.
  - Two files at once still compare.
  - A second file opened while the first's tab is open shows the prompt;
    Compare gives a comparison with the first on the left, Open as new tab
    gives a second tab, Escape behaves as Open as new tab.
  - With the first tab closed, a second file opens with no prompt.
  - The two tests asserting today's left-pane behaviour (`:47`, `:107`)
    change with the decision recorded.
- **Unit:** `openWithFromCli` routes one file to a snippet draft and two
  files to a comparison. Language detection comes from the file name.
- **e2e, slice 5:** open each tool in turn and measure the panel's bounding
  box: one width and height for all of them. Red on `main` first (460 vs 560
  and up).
  - At the minimum window size, no tool panel overflows the viewport, and its
    content does not scroll.
  - A resize made in one tool is the size the next tool opens at.
- **e2e, slice 5:** a press and release on the backdrop closes every tool
  (red on `main` for the text tools). A drag that starts inside and ends
  outside does not close it.
- **e2e, slice 5:** type into a tool, close it with a click outside, reopen
  it: the input is back.
- **Unit:** the per-tool session input store, keyed by tool id and cleared
  on relaunch.

## Docs impact

| surface             | needed? | what changes                                                                                                                         |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/standards.md` | yes     | rule 7 gains the reveal site; the hover contract is written beside the `.btn` and `.tile` rules                                      |
| `docs/security.md`  | yes     | the new sandbox exit, fenced                                                                                                         |
| `docs/features.md`  | yes     | Tools pinning, Show in folder, and "Open with" opens one file as an editor (the terminal row's `diffbro open [<file>]` text changes) |
| `README.md`         | no      | no feature-status change                                                                                                             |

## Delivery

One PR per design change, stacked with git-spice. Slice 1 targets `main`,
and each later slice targets the one below it. Each PR is reviewed alone and
is green on its own. The stack merges bottom-up and ships as one tag.

| #   | slice                                                                 | branch                             | base    | issue | PR   | status |
| --- | --------------------------------------------------------------------- | ---------------------------------- | ------- | ----- | ---- | ------ |
| 1   | Pinned group in Tools                                                 | `fix/tools-pinned-group`           | `main`  | #93   | #127 | merged |
| 2   | Hover contract and sweep channel                                      | `improvement/hover-contract`       | slice 1 | #94   | #128 | merged |
| 3   | Show in folder                                                        | `feat/show-in-folder`              | slice 2 | #95   | #129 | merged |
| 4   | One opened file becomes a snippet tab; one-row snippet head           | `improvement/open-file-as-snippet` | slice 3 | #96   | #130 |        |
| 5   | One tool window: shared size, click outside closes, JSON highlighting | `improvement/tool-window`          | slice 4 | #97   |      |        |

## Implementation plan

- [x] 0. Design canvas (drawn: https://claude.ai/artifact/FA9kFwk7FtaEoeA5LvtcqQ) → Approved design page signed off by the user.
- [x] 1. Slice 1.
- [x] 2. Slice 2.
- [x] 3. Slice 3.
- [x] 4. Slice 4.
- [x] 5. Slice 5.

## Decisions

| date       | decision                                                                                                                                  | why                                                                                                        | rejected                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2026-10-24 | Spec only; no code until the canvas is approved                                                                                           | the user asked for a spec now and the build later, on its own branch                                       | building alongside the v0.13.0 release                                              |
| 2026-10-24 | Show in folder reveals the encrypted store file holding the item                                                                          | the user: "should show the location of encrypted file"                                                     | the folder of the original files, which would need source paths stored at save time |
| 2026-10-24 | A second opened file asks "Compare with <previous file>?"; Yes compares, No opens a new tab                                               | the user's answer; the prompt is drawn on the canvas                                                       | always a new tab; always joining as a comparison                                    |
| 2026-10-24 | No migration of `dialogSize('encrypt')`; it resets                                                                                        | the maintainer dropped backward compatibility codebase-wide (#113)                                         | migrating the remembered size                                                       |
| 2026-10-27 | Snippet head is one row; Content bar is a band row; lines at 151 and 203 run across the divider                                           | the user picked option B on the canvas: "bands across divider"                                             | head landing on 203 alone (option A)                                                |
| 2026-10-27 | Tag overflow is a "+N" chip that opens the list                                                                                           | the user's choice                                                                                          | wrapping to a second row; clipping                                                  |
| 2026-10-27 | "Saves as …" is grey text in the name field; hides with a tooltip when the name is long                                                   | the user's choice on the canvas                                                                            | a floating hint; hints in the Content bar                                           |
| 2026-10-27 | File-slots row moves to 151 in slice 4                                                                                                    | the user: same slice                                                                                       | its own slice                                                                       |
| 2026-10-27 | "Opened from …" moves to the status bar                                                                                                   | the one-row head has no room; the user signed off the page with it                                         | a second head row                                                                   |
| 2026-10-27 | Hover floor is one step of 1.15, the `.btn` hover's own bar; toggles wash with `--btn-face`; the hovered tile edge is `--btn-edge-strong` | on nord a 1.4 wash and a 4.5 label cannot both hold; the sweep measured it                                 | a 1.4 wash floor; a per-theme wash                                                  |
| 2026-10-27 | Saved-diff rows put Export as image and Show in folder under "More actions"; snippet rows keep the icon                                   | five icons covered the row's middle, so a click on the name hit Share; the user chose option B on board 3c | five icons; right-click only                                                        |
| 2026-10-27 | The tool size is a JS constant, not CSS tokens                                                                                            | BaseDialog's resize keeps sizes in pixels and remembers them; a token would only be read back from CSS     | `--tool-dialog-w/h` tokens                                                          |
| 2026-10-27 | Every single-file open becomes a snippet: Open With, `diffbro open <file>`, one file dropped on an empty window                           | the spec's scope named all three; a git revision side of `open` still compares                             | Open With only                                                                      |
| 2026-10-27 | JSON tool highlights input and output                                                                                                     | the user, at sign-off                                                                                      | output only                                                                         |
| 2026-10-24 | Dismissing the prompt opens a new tab                                                                                                     | the non-destructive choice; the comparison is one Compare with… away                                       | dismiss cancels the open, which drops the file the user asked for                   |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] UI seen running
- [ ] Docs-impact "yes" done
- [ ] token usage measured
