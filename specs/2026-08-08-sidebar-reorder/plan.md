# Drag to reorder the sidebar lists

|                                         |                        |
| --------------------------------------- | ---------------------- |
| **Status**                              | shipped                |
| **Progress**                            | 8 / 8 steps            |
| **Branch**                              | `feat/sidebar-reorder` |
| **Started**                             | 2026-08-08             |
| **Finished**                            | 2026-08-08             |
| **Bugs found and fixed this iteration** | 6 / 6                  |
| **Token baseline**                      | 2026-08-08T15:06:11Z   |
| **Claude tokens used**                  | —                      |

## Problem

Sidebar order is fixed: `snippetStore` sorts `favorites` and `listed` by
`createdAt` descending (`snippetStore.js:123-124`), and `vaultStore` does the
same for saved and external diffs. A library built over months is therefore
ordered by an accident of when things were captured, and the only lever the user
has is the star — which is all-or-nothing and jumps an item to a different
group.

The user wants to arrange their own lists, with favourites still pinned above
the rest.

## Solution

An explicit `order` on each entry, and drag-and-drop as the only way to set it.

**The favourites constraint needs no code.** Both stores already split each
section into two lists — `favorites` / `listed`, `favoritesOwn` / `ownActive`,
`importedFavorites` / `importedOthers` — and each renders as its own group. A
drag is confined to the list it started in, so a non-favourite cannot be dropped
above a favourite: the rule falls out of the structure that is already there.
Starring still moves an item between groups, as it does today.

| option                                  | why not                                                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A sort dropdown (name / date / manual)  | The ask is manual arrangement. A mode selector adds a control, a persisted preference and a "why is drag disabled" state, to deliver the same thing behind one more click. |
| Up/down buttons on each row             | Two more controls per row in a list the sidebar already renders densely, and moving an item far takes many clicks. Drag is the direct manipulation people expect here.     |
| A fractional rank (like `tags.rank`)    | Avoids reindexing, but drifts into float precision after enough moves and makes "what is the order" unreadable in the store file. The lists are short; reindex is honest.  |
| Let a drag cross the favourite boundary | It would have to either silently star the item or silently refuse. Both are worse than a drop zone that simply ends where the group does.                                  |

## Scope

**In:**

- `utils/rowOrder.js` — pure: assign, move, reindex.
- `composables/useRowReorder.js` — the drag event logic and index maths.
- `order` on snippet and vault entries, persisted, with a migration for the
  entries that predate it.
- Reorder in all four groups: snippets (favourites + listed), saved diffs,
  external diffs.

**Out:**

- Reordering the SECTIONS themselves (Saved / External / Snippets / Tools).
- Reordering tools — that list is a registry, not a user's collection.
- Any sort mode other than the user's own order.
- The launcher's list: it is a search result, ordered by match, and `⌘N` is its
  fast path. Ordering a search is meaningless.

## Design

`order` is an integer, ascending, unique within its group. Every entry gets one
on first load (`assignOrder` fills them in the order the list is displayed
today, so the migration is invisible), and a drag reindexes the whole group
0…n-1 rather than trying to squeeze a value between neighbours.

A new entry takes `-1` so it leads its group, which preserves today's
newest-first feel for anything the user has not deliberately placed.

Drag affordance: the row is already `draggable` for the drag-into-the-diff-pane
gesture (`useSnippetDrag`), so the reorder must not fight it — see Decisions. The
drop indicator is a 2px `--accent` line between rows, drawn on the row being
dragged over, above or below by pointer position. No new token.

### Theme verdict — all 14

The only new ink is the drop indicator, `--accent` as a 2px rule against the
sidebar's row ground. It is a non-text mark, so the floor is 3:1. Values parsed
from `styles/themes.css`, accent against `--bg-panel`:

| theme    | ground | accent/panel | verdict                                 |
| -------- | ------ | ------------ | --------------------------------------- |
| light    | light  | 4.49         | pass                                    |
| dark     | dark   | 4.62         | pass                                    |
| solar    | light  | **3.21**     | pass — the weakest of the 14            |
| neon     | dark   | 9.79         | pass                                    |
| nord     | dark   | 5.03         | pass                                    |
| sepia    | light  | 3.81         | pass                                    |
| dim      | dark   | 7.23         | pass                                    |
| beacon   | dark   | 9.81         | pass — hard keyline untouched           |
| meridian | light  | 3.70         | pass                                    |
| linen    | light  | 5.65         | pass                                    |
| bloom    | light  | 4.34         | pass                                    |
| nyan     | dark   | 5.45         | pass — a flat 2px rule, no glow to halo |
| matrix   | dark   | 13.92        | pass — same                             |
| contrast | light  | 7.63         | pass — hard keyline untouched           |

A solid rule, never a glow: `matrix`, `nyan` and `neon` halo any accent-tinted
shadow, which is why the indicator is a line and not a highlight band.

## Security rules touched

**None — no IPC, no fs, no crypto, no new dependency, no external link.**
`order` is plaintext metadata beside `favorite` and `tags`, deliberately outside
the AAD for the same reason those are: reordering must never require re-keying
an entry, and it reveals nothing about the contents. A secret snippet reorders
like any other — its guarantee is about its body, not its position.

## Test plan

- **unit** — `tests/renderer/utils/rowOrder.test.js`: `assignOrder` fills only
  what is missing and preserves the displayed order; `moveWithin` moves up and
  down, is a no-op onto itself, and never changes length or membership;
  `reindex` produces 0…n-1 with no gaps; a new entry leads.
- **unit** — `tests/renderer/composables/useRowReorder.test.js`: a drag that
  starts in one group cannot drop in another; the above/below decision follows
  the pointer's position within the row; dropping on the source row is a no-op;
  a drag that never entered a row leaves the list untouched.
- **unit** — the store actions: reordering persists, survives a reload, and
  leaves `favorite` and `tags` alone.
- **e2e** — `e2e/sidebar-reorder.spec.mjs`: drag the third snippet to the top of
  its group and it stays there across a relaunch; a non-favourite dropped on a
  favourite does not enter the favourites group; the same for saved diffs.
- **red → green** — each watched failing first.
- **seed fixtures** — none; no new format or shape beyond the added field.

## Docs impact

| surface                  | needed? | what changes                                                                                       |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------- |
| `README.md`              | **yes** | the Snippets and Saved-diffs rows describe what the sidebar can do; manual ordering belongs there. |
| `docs/screenshots/*.png` | no      | ordering is invisible in a static frame; no captured state shows a drag.                           |
| `docs/roadmap.md`        | no      | no track covers sidebar ordering.                                                                  |
| `docs/brand/roadmap.svg` | no      | same.                                                                                              |
| `docs/*.md`              | no      | no IPC, no crypto, no new term.                                                                    |

## Implementation plan

- [x] 1. **Failing e2e first** — `e2e/sidebar-reorder.spec.mjs`.
- [x] 2. **`utils/rowOrder.js`** + unit tests, red → green.
- [x] 3. **`composables/useRowReorder.js`** + unit tests.
- [x] 4. **Snippet store**: `order` on the entry, migration, a `reorder` action,
      group getters sorting by it.
- [x] 5. **Vault store**: the same for saved and external.
- [x] 6. **Rows + indicator CSS**, shared in `ui.css` since four lists use it.
- [x] 7. **README**.
- [x] 8. **Close**: prettier on touched files, `npm run check`, host e2e,
      `/validate` — which now means fixing everything it finds, not listing it.

## Decisions

| date       | decision                                                                       | why                                                                                                                                                                                                                                                                                                                               | rejected                                        |
| ---------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 2026-08-08 | The favourite boundary is enforced by the EXISTING group split, not by a guard | Both stores already render favourites as their own list; a drag confined to its list cannot cross. A guard would be a second expression of the same rule, and the two would drift                                                                                                                                                 | a `canDrop` predicate comparing favourite flags |
| 2026-08-08 | Reindex the group on every drop, rather than a fractional rank                 | The lists are short, and an integer sequence stays readable in the store file. Fractional ranks drift into float precision and make the file hard to reason about                                                                                                                                                                 | `tags.rank`-style fractional insert             |
| 2026-08-08 | A new entry takes order `-1` so it leads                                       | Preserves today's newest-first feel for anything the user has not deliberately placed                                                                                                                                                                                                                                             | appending new entries last                      |
| 2026-08-08 | Both stores were AT their legacy caps, so the feature had to buy its room      | `snippetStore` (496) and `vaultStore` (366) had no lines left. Rather than raise a number the standards forbid raising, two cohesive blocks moved out: the tag registry (`stores/snippetTags.js`) and the retag/delete confirmation flows (`stores/vaultConfirmations.js`). Both caps are now BELOW where they were — 483 and 362 | raising the caps; splitting `tabs.js`           |
| 2026-08-08 | `deleteTag` stayed behind in `snippetStore`                                    | It sweeps the vault too, so moving it closed a new import cycle `snippetStore → snippetTags → vaultStore → snippetStore`. `check-structure` caught it                                                                                                                                                                             | moving the whole tag block                      |
| 2026-08-08 | A row's index is its place in the FULL group, not the filtered view            | Dropping A in front of B has to mean the same thing whether or not a filter hides the rows between them. Indexing the visible list would silently reorder rows the reader cannot see                                                                                                                                              | disabling reorder while filtering               |
| 2026-08-08 | Both drag payloads travel on ONE drag                                          | A row is already a compare drag source. Setting the reorder type alongside it lets where the drag LANDS decide which gesture it was, instead of a mode the reader has to know about                                                                                                                                               | a modifier key; a dedicated handle              |
| 2026-08-08 | Its OWN branch after all                                                       | The plan shipped in a PR that contained none of its code, which makes a spec a claim rather than a record. It goes with the implementation                                                                                                                                                                                        | sharing `fix/carried-audit-findings`            |

## Validation

- [ ] `/validate` — everything found is fixed in this change
- [ ] `npm run check`
- [ ] UI seen running — host e2e, all four groups
- [ ] Docs-impact "yes" done
- [ ] token usage measured

**Outcome:**
