# Open a file as a snippet, save a snippet as a file

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 0 / 6 steps |
| **Branch** | `feat/snippet-file-open-save` |
| **Started** | 2026-10-27 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-10-27T19:18:35Z |
| **Claude tokens used** | — |

## Problem

Issue #108. Since #130 a file opened from the OS becomes an unsaved snippet
tab, but there is no way to do that from inside the app, and no way to write a
snippet to disk except Copy as file (clipboard). The snippet toolbar already
carries four buttons (Compare with…, Copy, Copy as file, Save).

## Solution

- **Open File as Snippet…** (File menu, `CmdOrCtrl+O`, and a folder icon in the
  Snippets panel header between New and Export). Main's open dialog reads the
  file; the renderer hands it to the same path Open With uses (`openWithFlow`):
  an unsaved tab, or "Compare with…?" while an opened file's tab is still open.
  A binary or unreadable file gets today's notice.
- **Save Snippet as File…** (File menu, `CmdOrCtrl+Alt+S`, and the toolbar's ⋯
  menu). Always the OS save dialog, suggesting `<name>.<ext>` from
  `copyAsFile.snippetFile()` (`.txt` when unknown). It writes what the tab shows
  now. Never writes back to a source path.
- **Toolbar:** Compare with…, Copy, **⋯**, Save. The ⋯ menu holds **Copy as
  file** (moved out of the bar) and **Save as file…**. Copy as file's "copied"
  feedback becomes the usual notice.
- **Secret:** both menu items are disabled for a secret snippet, and the
  commands refuse it.
- **One write surface:** `diff:exportFile` gains a `text` format whose
  extension comes from the suggested name, validated in main
  (`[a-z0-9]{1,12}`, else `txt`). No second handler writes renderer text.
- **One menu component:** a generic `ActionMenu.vue` (trigger + the app's
  `.ctx` menu) serves this ⋯ and the saved-diff row's More actions, which is
  refactored onto it.

| option | why not |
|---|---|
| Write back to the opened file | the user chose an explicit Save as… every time |
| Toolbar button for Save as file | four save-shaped buttons; the user chose ⋯ |
| Copy as file split button (D) | a control type the app does not have |
| Labelled "Open file" button (B) | the user chose the icon (A) |
| A new `snippet:saveFile` IPC | `diff:exportFile` is the one audited write surface |

## Scope

**In:** the two commands, both menus, the shortcuts, the panel icon, the ⋯
menu, `ActionMenu.vue`, the `text` export format, `docs/features.md`,
`docs/security.md` (the write surface's new format).

**Out:** writing back to a source path; remembering the last folder; opening
several files from the dialog (one file, as Open With).

## Design

**Source of truth:** https://claude.ai/artifact/G4doQejxm3SPdRbmCvRDsh
**Approved design:** its "Approved design" page, chosen 2026-10-27 (A and the
revised C), awaiting sign-off.

| artboard | shows |
|---|---|
| Snippets panel: Open file icon (A) | folder-open icon between New and Export; tooltip "Open a text file as a snippet ⌘O" |
| Snippet toolbar (C, revised) | Compare with…, Copy, ⋯, Save; ⋯ open with Copy as file and Save as file… ⌥⌘S |
| File menu | Open File as Snippet… ⌘O, Save Snippet as File… ⌥⌘S |

Token-driven: the panel icon is the header's existing `.btn-icon` row; ⋯ is a
`.btn` + `.btn-icon` at `--control-h`; the menu is the shared `.ctx` (moved to
`ui.css` in #129), already swept on all 20 themes (`diff-row-more`).

### Theme verdict — all 20

No new colour or surface: every piece reuses a swept one (`.btn`, the header
icon buttons, `.ctx`). The sweep gains a `snippet-more` surface (menu item and
keyline over the snippet toolbar) so the reuse is measured, not assumed.

## Security rules touched

- **Rule 7 (leaving the sandbox):** none. The open dialog and the save dialog
  run in main; the renderer never names a path.
- **Writes:** `diff:exportFile` stays the single renderer-text write. The new
  `text` format takes a display name; main strips path characters, validates
  the extension, and the user picks the path in the OS dialog.
- **Secret snippets:** refused in the renderer command and disabled in the UI;
  `docs/security.md` records Save as file beside Copy as file.

## Test plan

- **unit, red first:** `snippetFile()` naming (existing); the `text` export
  format's extension validation (main, `files` test); `ActionMenu` open/close
  is covered through its e2e users; `openFileAsSnippet(stores, file)` routes a
  read file like Open With.
- **e2e, red first, `e2e/snippet-file.spec.mjs`:**
  - Open File as Snippet… (stubbed open dialog) opens an unsaved tab named
    after the file;
  - Save Snippet as File… (stubbed save dialog) writes the tab's current text
    to the chosen path, suggesting `name.ext`;
  - a secret snippet's ⋯ items are disabled;
  - Copy as file still works from the ⋯ menu.
- Existing specs that click the Copy as file button move to the ⋯ menu.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | no feature-status change |
| `docs/screenshots/*.png` | no | the sweep writes none; no README frame shows the snippet toolbar |
| `docs/roadmap.md` | no | not a roadmap item |
| `docs/brand/roadmap.svg` | no | same |
| `docs/features.md` | yes | snippets row: open a file, save as a file |
| `docs/security.md` | yes | the `text` export format; secret refuses Save as file |

## Delivery

| # | slice | branch | base | PR | status |
|---|---|---|---|---|---|
| 1 | `ActionMenu` + ⋯ with Copy as file and Save as file; File menu; `text` export | `feat/snippet-file-open-save` | `main` | | |
| 2 | Open File as Snippet: menu, shortcut, panel icon | `feat/open-file-as-snippet-menu` | slice 1 | | |

## Implementation plan

- [ ] 1. Red tests for slice 1.
- [ ] 2. `ActionMenu.vue`; refactor `SavedDiffMoreMenu` onto it; ⋯ in the snippet toolbar.
- [ ] 3. `text` export format in main; Save Snippet as File command, menus, shortcut.
- [ ] 4. Slice 2: red tests; Open File as Snippet command, menus, shortcut, panel icon.
- [ ] 5. Docs; sweep surface.
- [ ] 6. `npm run check`, `make e2e`, `make theme-sweep`, `/validate`; PRs; merge when green.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-27 | Save as file always asks for a path | the user's choice | write back to the source; both |
| 2026-10-27 | File menu + toolbar ⋯ for Save as file | the user's choice | a toolbar button; menu only |
| 2026-10-27 | Copy as file moves under ⋯ too | the user, on board C | keeping it as a button |
| 2026-10-27 | File menu + Snippets panel for Open | the user's choice | either alone |
| 2026-10-27 | Panel control is an icon (A) | the user's choice | labelled button (B) |
| 2026-10-27 | `CmdOrCtrl+O` open, `CmdOrCtrl+Alt+S` save as file | O is free and conventional; Shift+S is Swap sides | moving Swap sides; no shortcut |
| 2026-10-27 | A secret snippet refuses Save as file | same guarantee as Copy as file: never on disk | — |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] `make e2e`
- [ ] `make theme-sweep`
- [ ] Docs-impact "yes" done
- [ ] token usage measured
