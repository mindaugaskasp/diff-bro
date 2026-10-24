# Edit a snippet in place, with one layout

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 9 / 9 slices merged |
| **Branch** | one per slice; see Delivery |
| **Started** | 2026-10-23 |
| **Finished** | 2026-10-24 |
| **Bugs found and fixed this iteration** | 6 / 6 |
| **Token baseline** | not recorded |
| **Claude tokens used** | not measured: no baseline was taken, and the session also covered unrelated work |

## Problem

Seen on the host build, view vs edit of one snippet:

1. **The layout jumps.** Edit adds the "Template tags" link, the tag
   suggestions, the "3 of 20" counter and the "— or drop a file here" hint above
   the editor. The editor moves down about 100 px, and the name field changes
   width.
2. **The whole button row is swapped.** View shows Compare with…, Copy, Copy as
   file, Edit and Close. Edit shows Format, Copy, Clear, Save and Cancel. Every
   button moves, so the one under the pointer becomes a different button.
3. **Edit is a mode you have to ask for.** Edit, Cancel and Clear are
   ceremony. Close duplicates the tab's ×. Clear is Cmd+A then Delete.
4. **Cmd/Ctrl+F does nothing after Edit.** Pressing Edit leaves focus on
   `<body>`, so Monaco never sees the key (reproduced on the host:
   `activeElement` is `BODY`, and no `.find-widget.visible` appears). When it
   does open, replace is collapsed behind ▸.
5. **The history panel is cut off and fixed at 360 px.**
   - `.doc-main` has no `min-width: 0`, so a long line in the editor widens
     the document past the window, and the panel (`flex: none; width: 360px`)
     is pushed off the right edge.
   - Its diff scrolls sideways, so a long line opens mid-text.
   - The version list takes a fixed 40% even with two rows.
6. **The diff toolbar stays live over a snippet.** View, Paste mode, Save,
   Share, Copy diff, Capture and Clear act on a comparison nobody can see.

## Solution

**One layout, edited in place.**

- **No Edit, Cancel, Clear or Close buttons.**
  - Clicking the name, the tags or the content enters editing at that spot,
    with the caret where you clicked.
  - On hover, an editable surface tints with `--btn-face-hover` and shows a
    text cursor, so a click reads as "edit here" before it happens.
- **A fixed action row in both states:** Compare with…, Copy, Copy as file,
  then **Save**.
  - Save is always present: disabled while nothing has changed, primary once
    something has. It is also Cmd+S.
  - Format and History stay where they are now, both conditional; they do not
    swap with anything.
- **Nothing is added above the editor when editing starts.**
  - The tag suggestions and the counter open as a popover under the tag field
    while it has focus.
  - "Template tags" and the drop hint are present in both states.
- **Leaving editing.**
  - Save returns to the view.
  - Escape with no changes returns to the view.
  - Unsaved changes keep the tab's dirty dot, and the existing discard guard
    runs when the tab closes.
- **A new snippet** opens straight into editing, with the same layout.
- **Secret snippets** stay masked. Reveal is unchanged, and editing starts
  only once the content is revealed.
- **Toolbar over a snippet tab.** The diff-only actions (View, Paste mode,
  Save, Share, Copy diff, Capture, Clear) are disabled with a "For comparisons"
  tip. They use the existing off style: flat, no lift, weak keyline.

| option | why not |
|---|---|
| Keep Edit, fix only the jump | the user asked for Edit to go; a mode toggle is still a click before every change |
| Always editable, no view state | loses the rendered Markdown/Jira view, and the read-only safety for a snippet you only open to copy |
| Hide the toolbar's diff actions over a snippet | the toolbar would reflow on every tab switch, which is the same jump one level up |

## Scope

**In:**
- `SnippetDocument`, `SnippetDocumentHead`, `SnippetEditorActions` and the
  tag input's popover;
- `useSnippetDraft` (enter editing on click, Escape);
- the toolbar's disabled state for snippet tabs;
- tests, the theme sweep and the tour.

**Out:**
- the Mine/Received switch;
- the window's bottom edge (the sidebar polish spec);

## Design

**Source of truth:** [Snippet inline edit canvas](https://claude.ai/artifact/MypDg1JKJ5QrwkecZZ6ou6).
This section is pasted from it; change the canvas first, then re-paste here.

**Approved design:** the canvas's **Approved design** page (its launch page)
holds five frozen artboards with tag option A applied:
- at rest, with the hover cue;
- the template-tags popover;
- editing, while adding a tag;
- ⌘F find and replace;
- the history panel.

A sticky lists the decisions. It was published 2026-10-23 and was **signed off by the
user on 2026-10-23**. The **Exploration** page keeps the
alternatives and "Today".

| artboard | shows |
|---|---|
| **Proposed — at rest, hovering the content** (`Main.dc.html`) | The diff toolbar is disabled with a "For comparisons" tip. The action row (Compare with…, Copy, Copy as file, Save disabled) is the same as when editing. The content is a real editor (gutter, line numbers, status bar). Hover strengthens the keyline and shows a "Click to edit" chip. Tweaks: `dark`, `hover`. |
| **Proposed — editing, adding a tag** (`Editing.dc.html`) | Same positions. Save is primary, and the tab has its dirty dot. The chips gain ×, and the add chip becomes the input. Suggestions and "3 of 20" sit in a popover under it, over the editor. Current-line highlight and caret; the status bar shows `Ln, Col`. |
| **⌘F, find and replace** (`Find.dc.html`) | Monaco's find widget docked at the editor's top right. While editing it opens with replace expanded (Replace / All); while viewing, find only. The match is outlined in `--accent`. |
| **Tag field — three ways** (`Tags.dc.html`) | **A**, chips in a row plus a dashed "+ Add tag" chip with no frame (recommended); **B**, tags as a line of text; **C**, today's boxed field, tidied. |
| **History** (`History.dc.html`) | The editor column shrinks, so the panel always stays inside the window. A left-edge grip resizes it: default 440, min 320, max 60% of the document, persisted; double-click resets. Version rows show a relative time ("Current", "23 min ago"), the timestamp in `--text-meta` and `+1 −1`. The list fits its rows (up to 40%) and the diff wraps long lines. Tweaks: `dark`, `width`. |
| **Settings ▸ Editor** (`Approved-Settings.dc.html`) | A font picker listing only the monospace fonts installed on this computer, plus "System default". Each is shown in its own face, with a live preview. Zoom −/+ and Reset, with the shortcuts named. |
| **Today** (`Before.dc.html`) | Host screenshots of view and edit: five buttons swap and the editor drops about 100 px. |

**Layout rules the canvas fixes**
- **One action row in both states:** Compare with… · Copy · Copy as file ·
  Save. Save is never moved, only enabled.
- **Format sits beside Syntax**, in the content header, in both states. It is
  disabled where the syntax has no formatter. Clicking it while viewing
  enters editing and formats.
- **The content header is the same in both states:** "Content — or drop a
  file here". Nothing is inserted on entering editing.
- **Template tags live in the status bar**, not as a link above the tags.
  - A `{ } N template tags` item opens a popover on hover or focus.
    - **In this snippet:** the fill-in placeholders found in the content
      (`parseTemplateVars`). You are asked for these on copy, via
      `SnippetFillDialog`.
    - **Built in:** every `TEMPLATE_TOKENS` entry with its **live value**:
      `token.resolve(new Date(), locale)`, recomputed each time the popover
      opens, under the line "saving now would put in:". For example
      `{{week}}` → `2026-W43`. The catalogue label (`snippetTemplates.*`)
      becomes the row's tooltip.
  - With no fill-ins, the item still shows as `{ } Template tags`, so the
    built-ins stay discoverable.
  - The keyboard reaches it: the item is a `<button>` with `aria-expanded`,
    and Escape closes the popover.
- **Tags have no frame (option A).** They are chips in a row followed by a
  dashed `+ Add tag` chip.
  - Every tag element is one pill at `--chip-h`.
  - Editing adds × to each chip and turns the add chip into the input. The row
    never changes size.
  - Suggestions are a popover anchored under the input chip, open only while
    it has focus.
- **Rejected tag options.** B (a text line) loses the tag colours while
  editing, and a typo there makes a new tag. C (a framed field) makes the row
  resize when its frame appears.
- **The editor is one box:** gutter, code, then a 24 px status bar.
  - Viewing: line count, characters, template tags, syntax.
  - Editing: the same, plus `Ln, Col`.

- **Cmd/Ctrl+F anywhere in the snippet document** opens find in its editor.
  - It works whether focus is on the name, the tags or nothing at all, but
    never steals the key from another text input that handles it.
  - Editing opens `editor.action.startFindReplaceAction`, with replace
    expanded. Viewing opens find only.
  - Cmd+Alt+F (macOS) / Ctrl+H open replace directly.
  - The keys stay inside the snippet document, with no app-menu accelerator: a
    menu `CmdOrCtrl+F` would take Cmd+F away from the diff viewer's own Monaco
    find.

- **History panel:**
  - `.doc-main { min-width: 0 }`, so the panel can never be pushed off-screen.
    Amended in slice 1: the visible cut-off was the unwrapped diff, not
    `.doc-main`; the overflow test never went red and was dropped.
  - The width is resized from a left-edge grip through the existing
    `useSidebarResize` pattern (pointer capture, clamp, persist).
  - The list is `flex: none; max-height: 40%`.
  - The diff uses `wordWrap: 'on'`, inline below 640 px of width and side by
    side above it.
  - **The action sits on the selection, not in a footer.**
    - A band between the list and the diff reads `<selected> → Current`, with
      a `.btn-sm` **Copy this version** on its right.
    - With "Current" selected, the band says "This is the current version"
      and has no button.
    - The selected row carries the highlight (`aria-current`).
    - There is no footer bar.

- **Code-text zoom, one level for every code editor.**
  - `uiStore.diffZoom` becomes the editor zoom, and the snippet editor and
    the history diff apply it through `zoomedPx` as the diff viewer already
    does.
  - View ▸ Zoom In / Out / Reset (`CmdOrCtrl+=` / `-` / `0`, already in the
    menu and `MenuBar.vue`) act on whichever editor is in front.
  - The snippet status bar gets `− 100% +`; clicking the percentage resets.
  - The level does not persist across a relaunch, matching the diff viewer's
    zoom (`uiStore` keeps it session-only on purpose). Amended in slice 3.
- **Editor font**, in Settings ▸ Appearance ▸ Editor.
  - The options are a curated list of monospace families, filtered to the
    ones installed, with `document.fonts.check('12px "<family>"')`, plus
    "System default".
  - Nothing is downloaded, because the app is offline.
  - The choice is stored in `settingsStore.editorFont` and applied to every
    Monaco through `fontFamily`, so comparisons, snippets and history change
    together.
  - The preview shows `0O 1lI {}[]` so similar characters can be compared.

**Token mapping**

| element | token |
|---|---|
| editor surface | `--bg` (no grey wash in either state) |
| gutter and status bar | new `--editor-gutter` = `color-mix(in srgb, var(--bg) 60%, var(--bg-panel))`, held by `check:themes` |
| line numbers | `--text-meta` (`--text-dim` fails on sepia 3.72 and solar 4.22); current line `--text` |
| current line | Monaco's own line highlight, tinted to `--bg-hover` |
| template variables | `--syn-keyword` |
| hover keyline | `--btn-edge` (from `--border`) |
| "Click to edit" chip | `--bg` face, `--btn-edge` keyline, `--text` label, `--font-sm` |
| status-bar text | `--text-meta`, `--font-sm` |
| template-tags item | `--chip-h`-high `.btn`-less button, `{ }` glyph in `--syn-keyword`; open state draws a `--btn-edge` keyline |
| template-tags popover | `--bg-raised`, `--border`, `--shadow-2`; tokens in `--font-mono` + `--syn-keyword`, labels `--text-meta` |
| tag popover | `--bg-raised`, `--border`, `--shadow-2` |
| add-tag chip | `--chip-h`, a 1px dashed `--btn-edge` border, `--text-meta` label; as the input, an `--accent` keyline and focus ring |
| toolbar off | the existing `.btn:disabled` |
| resize grip | 3px pill in `--btn-edge`, `col-resize` cursor, 8px hit area |
| version change counts | the `.status-band` inks: `color-mix(in srgb, var(--dg-add) 55%, var(--text))` / the same with `--dg-del` (the raw `--dg-*` roles are 3:1 and fall to 1.80 on nord) |
| find widget | Monaco's, themed by `applyMonacoTheme` from the same tokens; the match is outlined in `--accent` |

### Theme verdict — all 20

Computed from `themes.css` against the new `--editor-gutter`:

| theme | line numbers (`--text-meta`) | status text (`--text-meta`) | code (`--text`) | note |
|---|---:|---:|---:|---|
| light | 11.36 | 11.36 | 17.47 | |
| dark | 9.95 | 9.95 | 15.50 | |
| solar | 7.33 | 7.33 | 12.89 | `--text-dim` would be 4.22 ✗ |
| neon | 10.76 | 10.76 | 16.68 | no accent glow added |
| nord | 6.94 | 6.94 | 9.92 | |
| sepia | 5.86 | 5.86 | 9.24 | `--text-dim` would be 3.72 ✗; the lowest that passes |
| dim | 8.86 | 8.86 | 13.60 | |
| beacon | 16.43 | 16.43 | 20.50 | hard keyline kept on the editor and the gutter divider |
| meridian | 7.83 | 7.83 | 11.98 | |
| linen | 8.63 | 8.63 | 14.59 | |
| bloom | 8.20 | 8.20 | 13.88 | |
| nyan | 11.43 | 11.43 | 15.88 | no accent glow added |
| matrix | 11.39 | 11.39 | 17.41 | no accent glow added |
| contrast | 16.67 | 16.67 | 20.12 | hard keyline kept |
| volcano | 16.59 | 16.59 | 20.56 | |
| amber | 8.75 | 8.75 | 12.67 | |
| tide | 10.23 | 10.23 | 14.59 | |
| ember | 10.87 | 10.87 | 14.92 | |
| graphite | 10.84 | 10.84 | 14.87 | |
| vector | 10.94 | 10.94 | 16.95 | |

- **Gutter against the editor surface: 1.02–1.09:1.** It is a quiet tint. The
  `--border` divider carries the separation, as Monaco's own gutter does.
- **Hover** is a keyline step to `--btn-edge`, already held at 3:1 by
  `check:themes`.
- **Before the PR**, a `snippet-document` sweep surface measures all of this
  on the live DOM.

## Security rules touched

None. No IPC, no fs, no crypto, no dependency, no link.

## Test plan

- **e2e (red first):** the editor's top is identical before and after a click
  enters editing (bounding box).
- **e2e (red first):** with a snippet tab in front, Paste mode and View are
  disabled.
- **e2e (red first):** Cmd/Ctrl+F straight after a snippet opens, with no
  click into the editor, shows find; while editing, the replace input is
  visible too.
- **e2e (red first):** with a long line in the snippet, the open history
  panel's right edge is within the window.
- **e2e:** dragging the grip changes the width within 320 px..60%; the width
  survives a relaunch; the diff has no horizontal scroll (`scrollWidth <=
  clientWidth`).
- **e2e:** hovering or focusing the status-bar template-tags item lists the
  content's fill-ins and all nine built-ins, each with its label; the old
  "Template tags" link is gone.
- **e2e (red first):** Cmd+= with a snippet tab in front grows the snippet
  editor's font (computed `font-size`); today it does not.
- **e2e:** choosing a font in Settings changes the snippet and diff editors'
  computed `font-family`; the choice survives a relaunch.
- **unit:** `steppedZoom` is reused unchanged; `installedFonts(check)` keeps
  only the families the checker reports.
- **unit:** `useSnippetFindKeys` routes the key and leaves other inputs alone.
- **e2e:**
  - clicking the content enters editing with the caret there;
  - the hover changes the surface colour (computed style);
  - Save is disabled until a change, then saves and returns to the view;
  - Escape with no change returns to the view;
  - a dirty tab's × asks first.
- **unit** `useSnippetDraft`: enter-on-click, Escape, the disabled state of
  Save.
- **existing specs re-pointed:** `snippet-discard`, `editor-artifacts`,
  `snippet-edit-*`, the tour's snippet-save step.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `docs/features.md` | yes | the snippet row: edit in place |
| `docs/screenshots/*.png` | check | if any frame shows a snippet document |
| `README.md` | no | |

## Delivery

One PR per design change, each deployable alone from `main`, in merge order.
No slice depends on an unmerged sibling, and each starts with its own failing
tests.

| # | slice | branch | what it ships | PR | status |
|---|---|---|---|---|---|
| 0 | Spec, canvas and process rules | `docs/snippet-redesign-spec` | this plan; `/implement` rules: design artifact first, approved design gate, one PR per slice | #71 | merged |
| 1 | History panel | `fix/snippet-history-panel` | never off-screen (`.doc-main` min-width 0); left-edge resize 320 px..60%, persisted; wrapped diff; version rows with relative time and ±; Copy this version in a band above the diff | #72, #73 | merged |
| 2 | ⌘F find and replace | `fix/snippet-find-replace` | Cmd/Ctrl+F anywhere in the snippet opens find; replace expanded while editing; Cmd+Alt+F / Ctrl+H | #74 | merged |
| 3 | Code zoom in snippets | `fix/snippet-editor-zoom` | View ▸ Zoom (⌘+ ⌘− ⌘0) scales the snippet editor and history diff too, one shared level | #75 | merged |
| 4 | Editor font | `feat/editor-font` | Settings ▸ Appearance ▸ Editor: installed monospace fonts only, live preview, applied to every Monaco | #77 | merged |
| 5 | Toolbar over a snippet | `fix/toolbar-snippet-context` | View, Paste mode, Save, Share, Copy diff, Capture and Clear disabled with a "For comparisons" tip | #76 | merged |
| 6 | Editor status bar | `improvement/snippet-status-bar` | gutter and line numbers (`--text-meta`); status bar with counts, Ln/Col, `− 100% +`, and the template-tags popover with live values; the "Template tags" link is removed | #78 | merged |
| 7 | Tag chips (A) | `improvement/snippet-tag-chips` | chips in a row, dashed + Add tag, no frame; × and an inline input while editing; suggestions in a popover | #79 | merged |
| 8 | Inline edit | `improvement/snippet-inline-edit` | one layout; no Edit, Cancel, Clear or Close; click to edit with the hover cue; fixed action row; Save disabled until changed; Format beside Syntax; Escape | #80 | merged |

Each slice's PR description links this spec and the **Approved design**
artboard it implements. `/validate` holds it against that artboard. The PR is
done only when its CI is green on every runner.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | Tags: option A (chips in a row, dashed + Add tag, no frame) | the user's pick; one pill shape, and the row never resizes | B (a text line), C (a framed field) |
| 2026-10-23 | History: Copy this version moves from the footer to a band above the diff, scoped to the selected version | the user found the footer button out of place; a footer action reads as panel-wide, not version-specific | keeping the footer and adding a label |
| 2026-10-23 | One zoom level shared by all code editors | one mental model, "how big code text is", and it reuses the existing ladder and shortcuts | a separate zoom per surface |
| 2026-10-23 | The font list is installed fonts only | offline: no web fonts; listing an absent font silently falls back | free-text font name |
| 2026-10-23 | Built-in template tags show their live value, with the description as a tooltip | the user asked; a value says exactly what saving will write, from the same `resolve` that writes it | the description alone |
| 2026-10-23 | The approved artboards are frozen copies, not imports of the exploration ones | later exploration must not change what was signed off | `<dc-import>` wrappers |
| 2026-10-24 | Inline edit: File ▸ Save saves the snippet in front; closing an unsaved one goes through the tab's own close guard | one save path and one discard guard, so no bar of its own in the document | keeping the in-document discard bar |
| 2026-10-24 | The disabled Format is held to the non-text floor (DIM) in the sweep | an inactive control is not text to be read; the enabled one keeps TEXT | forcing the disabled label to 4.5:1 |

## Validation

- [x] `/validate`: over the whole series (#71–#80), on `docs/snippet-redesign-shipped`.
  - Comments: seven multi-line headers trimmed. One comment that still named the
    removed Edit button was reworded.
  - Conventions: a hard-coded tooltip in `SnippetEditorActions.vue`, there since
    #24, moved to `snippetEditorActions.secretCopyAsFileTip`.
  - Security: no injection sinks and no Node or Electron import in the renderer.
    The only main-process change is the two `STORE_NAMES` entries. No new
    dependencies.
- [x] `npm run check`: green. 3983 tests passed and 2 skipped. Coverage:
  statements 95.44, branches 88.56, functions 96.03, lines 96.45.
- [x] UI seen running: `make e2e E2E_WORKERS=4` on every slice, plus CI e2e on
  four shards per PR.
  - The theme sweep covers the `snippet-inline-edit`, `snippet-history` and
    `snippet-tag-chips` surfaces: 340 measurements across 20 themes.
- [x] Docs-impact "yes" done: `docs/features.md` was updated in #80.
  - The theme screenshots were regenerated by the sweep.
- [ ] token usage measured: no baseline was recorded at the start.

**Outcome:** shipped. Every slice landed on its own PR with CI green on Ubuntu,
on Windows and on the four e2e shards.

One follow-up comes out of slice 8. Closing an unsaved snippet tab reuses the
tab guard's "Close comparison?" wording. It ships as its own fix.
