# Fixes from QA before v0.15.1

|                                         |                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------ |
| **Status**                              | shipped                                                                  |
| **Progress**                            | 9 / 9 steps                                                              |
| **Branch**                              | stack below, from `fix/snippet-tags-save`                                |
| **Started**                             | 2026-10-31                                                               |
| **Finished**                            | 2026-10-31                                                               |
| **Bugs found and fixed this iteration** | 21 / 21                                                                  |
| **Token baseline**                      | 2026-10-31T14:39:45Z                                                     |
| **Claude tokens used**                  | 11,811,976 processed, mostly cache reads, up to the last PR's submission |

## Problem

A QA pass over `a1a9c58`, driving the built app with real clicks and keys, found 21 defects before the release was tagged. Three lose data, and several came from the snippet bar redesign (#163, #166).

## Solution

Every defect gets a failing test first, in the stack below. Matters of taste from the same report are left alone.

| defect                                                                    | fix                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. A removed tag came back after saving                                   | `TagChipRow` exposes the refs, not a spread of their values                          |
| 2. A tag-only change could not be saved and vanished on close             | tags count towards `isDirty`; text still being typed is saved with the snippet       |
| 3. Long tags pushed Add tag off the window                                | tags shrink and cut with an ellipsis; the full name is in `data-tip`                 |
| 4. +N popover: × dead with a mouse, popover overflowed                    | backdrop is the anchor's sibling, not teleported; popover anchors to the row         |
| 5. Saving a diff mangled its name                                         | a saved diff's tab carries the library's name; only an unsaved tab's name is cleaned |
| 6. Merge chip faded on hover                                              | rests with no face, then steps the hover and press ladder                            |
| 7. Code showed through pane label and presentation exit on hover          | the wash sits over an opaque `--bg`                                                  |
| 8. Patch overwrote an unsaved comparison, or did nothing behind a snippet | opens in its own tab                                                                 |
| 9. Palette lost focus to the app behind it                                | Tab stays in the palette; File ▸ New Snippet added, so the palette can find it       |
| 10. New snippet and paste mode focused nothing useful                     | focus the name; focus the first text box                                             |
| 11. Tour pointed at a Keys rail entry that is gone                        | names Security ▸ Trusted Keys                                                        |
| 12. Home search with no match said "Nothing here yet"                     | its own message                                                                      |
| 13. Delete confirm had no space between sentences                         | a space                                                                              |
| 14. Backspace removed a tag hidden behind +N                              | Backspace removes only a tag you can see                                             |
| 15. At 20 tags the input blurred and the hint never showed                | the input goes read-only, keeping focus                                              |
| 16. Too-deep alert outlived the text it was about                         | cleared when the text changes                                                        |
| 17. A tag cut at 40 characters could end in `/`                           | `cleanTag` strips the trailing separator                                             |
| 18. Save diff's name was not selected on open                             | select after the name renders                                                        |
| 19. ⋯ with every item disabled could not be closed with Escape            | the menu takes focus itself                                                          |
| 20. Settings ▸ Storage: centred row, oversized sentence                   | row direction; `.hint` styled in that component                                      |
| 21. Lines tool squeezed its input and result                              | the panel keeps its size and the dialog body scrolls                                 |

## Scope

**In:** the 21 defects.

**Out:**

- Matters of taste: old pills in suggestion lists, the × covering a very short tag, row tag clipping, saved-diff row width, Two files opening one picker, pasted-text tab titles, the drop not prompting, Secure as the default expiry, Base64's minimum run.
- Undo for a deleted snippet: the confirm stays the guard.

## Design

No new look. Everything follows the Approved design for #144 and the snippet bar.

## Docs impact

| doc                 | stale? |
| ------------------- | ------ |
| `README.md`         | no     |
| `docs/features.md`  | no     |
| `docs/standards.md` | no     |
| `docs/screenshots/` | no     |

## Delivery

| #   | slice                                      | branch                  | base   | PR   | status |
| --- | ------------------------------------------ | ----------------------- | ------ | ---- | ------ |
| 1   | Tags are part of a snippet's draft (1, 2)  | `fix/snippet-tags-save` | `main` | #167 | merged |
| 2   | Tag row and +N stay in the window (3, 4)   | `fix/tag-row-overflow`  | 1      | #168 | merged |
| 3   | Tag field edges (14–17)                    | `fix/tag-field-edges`   | 2      | #169 | merged |
| 4   | Saved diff names (5, 18)                   | `fix/saved-diff-name`   | 3      | #170 | merged |
| 5   | Hover faces (6, 7)                         | `fix/hover-faces`       | 4      | #171 | merged |
| 6   | Patch opens in its own tab (8)             | `fix/patch-own-tab`     | 5      | #172 | merged |
| 7   | Keyboard focus (9, 10, 19)                 | `fix/keyboard-focus`    | 6      | #173 | merged |
| 8   | Copy and small layout (11, 12, 13, 20, 21) | `fix/small-copy-layout` | 7      | #174 | merged |

## Implementation plan

- [x] 1. Slice 1
- [x] 2. Slice 2
- [x] 3. Slice 3
- [x] 4. Slice 4
- [x] 5. Slice 5
- [x] 6. Slice 6
- [x] 7. Slice 7
- [x] 8. Slice 8
- [x] 9. Gates, merge the stack, tag v0.15.1.

## Decisions

| date       | decision                                                                                                     | why                                                                                                                                                            | rejected                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2026-10-31 | Fix all 21 before tagging                                                                                    | the user asked for what QA found to be fixed                                                                                                                   | fixing only the data-loss ones                                                 |
| 2026-10-31 | Patch always opens its own tab                                                                               | nothing to lose, and no new prompt                                                                                                                             | a Replace prompt, as picking a file has                                        |
| 2026-10-31 | A tab linked to a saved diff keeps the library's name verbatim; an unsaved tab's typed name is still cleaned | cleaning a label is a deliberate rule (#60), overwriting the user's name with it is not                                                                        | relaxing `cleanTabName` for every tab                                          |
| 2026-10-31 | File ▸ New Snippet joins the menu map, with no shortcut                                                      | the palette lists menu items, so a command without one cannot be found                                                                                         | a palette-only row                                                             |
| 2026-10-31 | The release audit gate covers production dependencies only                                                   | the user chose it: `minimatch` and `glob` advisories in dev tools blocked v0.15.1 with no fix short of a major those tools cannot take; the shipped app passes | signing off the two advisories by ID, overriding versions, holding the release |
| 2026-10-31 | Backspace stops at the tags in view rather than opening +N                                                   | a keystroke should not remove what you cannot see                                                                                                              | removing the Backspace shortcut everywhere                                     |

## Validation

- [x] `npm run check` 0 (3987 passed, 2 skipped).
- [x] `make e2e` 679 passed, 4 skipped, before the last two test and token corrections; `hover-faces`, the tour test and the sweep were rerun after them.
- [x] `make theme-sweep` ok, 3600 measurements across 20 themes.
- [x] Real-app renders checked on light, dark, contrast and matrix at 1120x640.

### Token usage

The window starts when the fixes started, so the QA pass isn't counted.

| category    |         tokens |
| ----------- | -------------: |
| input       |             98 |
| output      |         75,957 |
| cache write |        116,701 |
| cache read  |     11,619,220 |
| **total**   | **11,811,976** |
