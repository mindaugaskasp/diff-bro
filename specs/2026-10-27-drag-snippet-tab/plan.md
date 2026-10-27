# Drag a snippet tab onto a comparison pane

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 0 / 4 steps |
| **Branch** | `feat/drag-snippet-tab` |
| **Started** | 2026-10-27 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-10-27T18:19:16Z |
| **Claude tokens used** | — |

## Problem

Issue #105. The empty comparison pane says "Drag a file or a snippet here". A
snippet's sidebar row can be dragged in (`useSnippetDrag.js`,
`DRAG_TYPE = 'application/x-diffbro-snippet'`), but an open snippet **tab**
cannot: `DiffTabBar.vue` sets no drag data, and tabs are not draggable at all.
A user with the snippet open in a tab reaches for the tab, and nothing happens.

## Solution

A snippet tab is draggable. Dropped on a comparison pane (the drop zone or a
file slot), it loads into that side, exactly as dragging its sidebar row does.

- **What loads:** the text the tab shows now, unsaved edits included. A
  never-saved tab works too; the side is named after the tab's title.
- **The tab stays open:** the drop copies, it does not move.
- **Snippet tabs only.** A comparison tab has two sides, so it is not a drag
  source.
- **Secret:** a secret snippet tab does not start a drag, the same rule its
  sidebar row follows.
- **Payload:** the tab id, under a new type
  `application/x-diffbro-snippet-tab`, never the body (the row drag's rule: a
  drop target outside the app can read the payload). The drop reads the live
  text through a per-tab content registry that each open `SnippetDocument`
  fills and clears on unmount.
- **Feedback:** the existing drag overlay, which already says what a snippet
  drop will do, and the same "only over the comparison column" rule.

| option | why not |
|---|---|
| Load the saved version only | the user's choice: what you see is what you dragged |
| Comparison tabs as a source | ambiguous: which side? |
| Close the tab after the drop | loses nothing only if it prompts; copying is the row's behaviour |
| Put the body on the drag | rule from `useSnippetDrag`: payloads stay ids |

## Scope

**In:** `DiffTabBar.vue` (draggable snippet tabs), a tab-content registry
composable, `useFileDrop.js` routing for the new type, and the overlay's
`dragKind`.

**Out:** reordering tabs by drag; dragging a tab into another window; dropping
on the sidebar.

## Design

No new visual: the tab is the drag handle, and the drop overlay and slots are
the ones a row drag already uses. No canvas.

## Security rules touched

None crossing a boundary: renderer only, no IPC, no fs. The drag payload is a
tab id, so no snippet body reaches the OS drag store; a secret tab cannot start
a drag.

## Test plan

- **unit**, `tests/renderer/composables/useTabContent.test.js`: register,
  read, unregister; a missing tab reads as null.
- **unit**, `useSnippetDrag` / drop routing: a tab payload resolves to that
  tab's current text; a secret tab refuses to start.
- **e2e, red first**, `e2e/drag-snippet-tab.spec.mjs` (synthetic DragEvent, as
  `compare-snippets.spec.mjs` does):
  - a saved snippet tab dropped on the left slot loads its text there;
  - a new tab with typed, unsaved text loads that text, named after the tab;
  - the snippet tab is still open afterwards;
  - a secret tab does not start a drag.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | no feature-status change |
| `docs/screenshots/*.png` | no | nothing visible changes |
| `docs/roadmap.md` | no | not a roadmap item |
| `docs/brand/roadmap.svg` | no | same |
| `docs/features.md` | yes | the snippets row mentions dragging a tab onto a side |

## Delivery

One PR: it is one change.

| # | slice | branch | base | PR | status |
|---|---|---|---|---|---|
| 1 | Drag a snippet tab onto a pane | `feat/drag-snippet-tab` | `main` | | |

## Implementation plan

- [ ] 1. Red tests (unit and e2e).
- [ ] 2. Tab-content registry; `SnippetDocument` registers; `DiffTabBar` drag start; drop routing.
- [ ] 3. `docs/features.md`.
- [ ] 4. `npm run check`, `make e2e`, `/validate`, PR, merge when green.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-27 | Drop the tab's current text, unsaved edits included | the user's choice | saved version only; refuse unsaved |
| 2026-10-27 | Snippet tabs only | a comparison tab has two sides | comparison tabs too |
| 2026-10-27 | The tab stays open | the user's choice; matches the row drag | close it |
| 2026-10-27 | A secret tab does not start a drag | the issue: same rules as the sidebar row | — |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] `make e2e`
- [ ] Docs-impact "yes" done
- [ ] token usage measured
