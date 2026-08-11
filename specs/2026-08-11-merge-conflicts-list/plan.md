# Merge conflicts list — the list in front of the merge

|                                         |                             |
| --------------------------------------- | --------------------------- |
| **Status**                              | shipped                     |
| **Progress**                            | 14 / 14 steps               |
| **Branch**                              | `feat/merge-conflicts-list` |
| **Started**                             | 2026-08-11                  |
| **Finished**                            | 2026-08-11                  |
| **Bugs found and fixed this iteration** | 13 / 13                     |
| **Token baseline**                      | 2026-08-11T09:43:47Z        |
| **Claude tokens used**                  | 79,949,706 processed        |

## Problem

`git mergetool` walks conflicted files one launch at a time. DiffBro shows the
file git happens to be asking about and a chip reading `3 of 7`
(`MergeView.vue`, `merge.showsWalk`) — and that is the entire picture the reader
gets. The other six files are invisible: there is no way to see what is left,
no way to choose an order, and no way to take a whole side without opening
three Monaco editors for a file whose answer is "take theirs".

Two smaller defects fall out of the same place:

- The take chevron lives in Monaco's glyph margin (`mergeDecorations.js:63`,
  `mergePaneOps.takeFromGutter`). A glyph margin exists only on an editor's
  **left** edge, so `take theirs` lands beside the result by accident while
  `take ours` sits at the far left of the window, two panes from where its text
  goes. It is also not keyboard-reachable — it is a CSS mask on a margin, not a
  button.
- A merge session can only be entered once. Nothing reopens anything.

## Solution

A conflicts list — `BaseDialog`, 720px — in front of the three-way view. Every
unmerged path, its state, and a whole-file `Ours` / `Theirs` per row. Picking a
row opens the three-way view that already exists; saving returns to the list.

Approved across three revisions of
<https://claude.ai/code/artifact/eef24614-a876-4a84-af58-9d348095f0d7>.

| option                                                      | why not                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate `BrowserWindow` for the list                       | Every modal in this app is a `BaseDialog`; a second window needs its own CSP, permission handler and `will-navigate` block. User chose this. |
| Recompute regions from the index instead of reading markers | Replaces git's own auto-merge with a different algorithm on the one file the app overwrites. Settled in v0.4.31; unchanged here.             |
| Tally from three index reads per file                       | 200-file lock conflict makes the dialog wait on 600 `git show` calls. Marker scan of the working file instead — recorded below.              |
| Per-region `×` (take neither) button                        | Cut by the user: it is the one answer that discards text, and a hover target on the line being read is the wrong place for it.               |
| Keep the glyph-margin chevrons and _add_ inner-edge buttons | Two affordances for one action. Moving them is a rewrite of tested code, accepted deliberately.                                              |

## Scope

**In:** the list dialog; whole-file take from the index; out-of-order
resolution; the already-resolved sentinel; three re-entry routes; take controls
moved to the panes' inner edges; three status-ink tokens and
`--btn-edge-strong`.

**Out:** grouping by directory (earns its keep past ~20 files, additive later);
reconstructing a session after `git mergetool` has exited (git no longer calls
those files unmerged — DiffBro must not pretend to own a walk git has stopped).

## Design

Tokens only. New in `tokens.css`:

| token               | value                                                        | why                                                                                                |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `--mg-open`         | `color-mix(in srgb, var(--warning-border) 45%, var(--text))` | raw `--warning-border` as ink scores **2.73** (light) / 2.74 (contrast) — under 4.5 on 9 themes    |
| `--mg-done`         | `color-mix(in srgb, var(--success-text) 55%, var(--text))`   | raw scores 3.09 (solar) / 3.61 (sepia)                                                             |
| `--mg-blocked`      | `color-mix(in srgb, var(--danger-border) 35%, var(--text))`  | `--danger-border` is the weakest role; nord caps the mix at 35%                                    |
| `--btn-edge-strong` | `color-mix(in srgb, var(--border) 25%, var(--text))`         | the take button floats on a tinted band where `--btn-edge` lands at 2.99 (sepia) / 3.00 (meridian) |

Row: 3px status stripe · `<AppIcon>` (`git-merge` / `check` / `binary`, all
already in `icons.js`) · name in `--font-mono` `--text` · directory in
`--text-hint` (**not** `--text-dim`, which scores 2.96 on a hovered row) ·
tally · hover/focus `Ours` `Theirs` as plain `.btn`. Selection is
`--bg-hover` **plus** a `--btn-edge` keyline — the wash alone is 1.15 on amber.
List well is `--bg` inside the `--bg-panel` dialog. Footer `Close` (ghost, the
dismissive twin) + `Resolve` (primary).

### Theme verdict — all 20

Values parsed from `styles/themes.css`. Each theme's **tightest** pair of the
nine measured; all 20 pass.

| theme    | ground | tightest pair | value | floor | verdict | note                                                          |
| -------- | ------ | ------------- | ----- | ----- | ------- | ------------------------------------------------------------- |
| light    | light  | well keyline  | 1.59  | 1.2   | passes  | only theme that inverts canvas/raised                         |
| dark     | dark   | well keyline  | 1.42  | 1.2   | passes  | reference palette                                             |
| solar    | light  | well keyline  | 1.29  | 1.2   | passes  | `--text-dim` path scored 4.36 → moved to `--text-hint`        |
| neon     | dark   | well keyline  | 1.42  | 1.2   | passes  | accent `#22d3ee`; no glow anywhere                            |
| nord     | dark   | blocked ink   | 4.60  | 4.5   | passes  | weakest red `#a54c55` caps the mix at 35%                     |
| sepia    | light  | done ink      | 4.59  | 4.5   | passes  | tightest theme in the set on every pair                       |
| dim      | dark   | well keyline  | 1.33  | 1.2   | passes  |                                                               |
| beacon   | dark   | blocked ink   | 10.33 | 4.5   | passes  | hard keyline `#e0e0e0`; well reads as a framed table at 14.9  |
| meridian | light  | well keyline  | 1.40  | 1.2   | passes  | `--btn-edge` on a band was exactly 3.00 → `--btn-edge-strong` |
| linen    | light  | well keyline  | 1.28  | 1.2   | passes  |                                                               |
| bloom    | light  | well keyline  | 1.24  | 1.2   | passes  | faintest frame; stripe carries the structure                  |
| nyan     | dark   | blocked ink   | 8.63  | 4.5   | passes  | accent `#ff2ecb` never a fill or a label                      |
| matrix   | dark   | blocked ink   | 8.88  | 4.5   | passes  | `--accent` = `--success-text` = `#00ff41`; ring is an outline |
| contrast | light  | open ink      | 7.78  | 4.5   | passes  | hard keyline `#111111`; raw warning ink was 2.74 here         |
| volcano  | dark   | blocked ink   | 10.69 | 4.5   | passes  | hard keyline `#ffc9a4`; widest margins                        |
| amber    | dark   | blocked ink   | 7.30  | 4.5   | passes  | `--text` is itself gold — icon and word carry the state       |
| tide     | dark   | well keyline  | 1.71  | 1.2   | passes  |                                                               |
| ember    | dark   | well keyline  | 1.46  | 1.2   | passes  |                                                               |
| graphite | dark   | well keyline  | 1.52  | 1.2   | passes  | near-achromatic accent; status hues are the only colour       |
| vector   | light  | well keyline  | 1.64  | 1.2   | passes  |                                                               |

## Security rules touched

**Rule 3 (renderer/main), rule 6 (untrusted input) and rule 7 (fenced exits) —
all three come near, and this is the section that matters.**

- The renderer **never names a file**. `merge:list` returns entries with a
  display name and a directory label; every mutating call takes an **index into
  the list main built**. `mergeSession.js` keeps the list; a path is recomputed
  in main from the repo root plus that entry.
- Every write **re-verifies at write time**, not at list time: the target must
  still appear in `git diff --name-only --diff-filter=U` for the repo this
  launch was given. A file that stopped being unmerged between listing and
  clicking is refused.
- Stage reads keep `mergeInputs.js`'s existing ceiling (`MAX_STAGE_BYTES`,
  32 MB) and binary sniff. A binary or oversized file is listed as `blocked`
  and can only be answered whole-file, never opened as text.
- No new dependency, no network call, no `shell.*`, no crypto. `git` is invoked
  through the existing `runGitIn` with `HARDENING` and `gitEnv` (every `GIT_*`
  dropped).

## Test plan

- **unit** `tests/main/conflictList.test.js` — enumerate, tally, blocked
  classification, and the refusal cases: index out of range, entry no longer
  unmerged, path escaping the root.
- **unit** `tests/main/mergeSession.test.js` (extend) — the resolved set across
  launches; an already-resolved launch writes `written` without a pending
  session.
- **unit** `tests/renderer/features/merge/conflictsStore.test.js` — open/close,
  selection, marking resolved, remaining count, re-entry availability.
- **unit** `tests/renderer/features/merge/mergeTakeOverlay.test.js` — anchor →
  offset mapping for the inner-edge buttons.
- **e2e** `e2e/merge-conflicts-list.spec.mjs` — real `git mergetool` over a
  3-file conflict: the list opens first; resolve the _third_ file first; the
  relaunch for it never shows a view; reopen the list from the walk chip.
- **red → green** — the two defects fixed here (`takeFromGutter` not
  keyboard-reachable, no route back after dismissing) each get their failing
  test watched first.

## Docs impact

| surface                  | needed? | what changes                                                                                                         |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | yes     | merge flow is a headline capability; the description says "one file at a time" implicitly                            |
| `docs/screenshots/*.png` | no      | none of the five captured states (`empty-state`, `diff-*`, `save-encrypted`, `spreadsheet-diff`) show the merge view |
| `docs/roadmap.md`        | yes     | merge track gains this item as done                                                                                  |
| `docs/brand/roadmap.svg` | yes     | same move, hand-authored alongside                                                                                   |
| `docs/security.md`       | yes     | rule 7's merge paragraph — main now writes more than one file per launch, under a verified list                      |
| `docs/ipc-security.md`   | yes     | three new handlers, all index-addressed                                                                              |

## Implementation plan

- [x] 1. `src/main/conflictList.js` — pure core + tests, red first
- [x] 2. `mergeSession.js` — resolved set, list custody, already-resolved sentinel
- [x] 3. `cliRoute.js` — build the list on a merge launch; short-circuit a resolved file
- [x] 4. IPC + preload — `merge:list`, `merge:takeSide`, `merge:openIndex`
- [x] 5. `tokens.css` — the four tokens
- [x] 6. `conflictsStore.js`
- [x] 7. `ConflictsDialog.vue` + `ConflictRow.vue` + styles
- [x] 8. Re-entry: walk chip button, toolbar chip, menu entries, `commands.js` row
- [x] 9. Take controls → pane inner edges (`useMergeTakeOverlay.js`), glyph margin removed
- [x] 10. `en.json` + `node scripts/pseudolocale.mjs`
- [x] 11. Unit tests to the coverage floor
- [x] 12. `e2e/merge-conflicts-list.spec.mjs`
- [x] 13. `theme-sweep.mjs` — `conflict-list` surface
- [x] 14. Docs rows above

## Decisions

| date       | decision                                              | why                                                                                                           | rejected                              |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 2026-08-11 | Tally comes from a marker scan of the working file    | Three index reads per file blocks the dialog on a large conflict; the count is a scanning aid, not a contract | index-derived tally                   |
| 2026-08-11 | Renderer addresses files by list index, never by path | Rule 3/7 — main has held the merge path since launch and must keep holding it                                 | passing a repo-relative path over IPC |
| 2026-08-11 | Write-time re-verification against `--diff-filter=U`  | The list can go stale between opening and clicking; a stale entry must fail closed                            | trusting the list snapshot            |
| 2026-08-11 | Closing the dialog does not end the merge session     | One owner for that decision (Save/Cancel in the three-way view), so a dismissed modal cannot end a merge      | `Later` cancelling the current file   |
| 2026-08-11 | Take controls move rather than duplicate              | Two affordances for one action is worse than a rewrite                                                        | keeping the glyph-margin chevrons     |

## Validation

- [x] `npm run check` — **exit 0**. `eslint . --max-warnings 0` clean; style,
      theme-depth, structure, i18n and rawtext gates clean; 3348 tests passing;
      coverage 95.41 / 88.42 / 95.82 / 96.48 against floors 95 / 88 / 95 / 96.
- [x] `make e2e` — **exit 0**, 483 passed (5.7m), including the six new
      `merge-conflicts-list` specs and the 19 in `merge-resolve`.
- [x] `make theme-sweep SWEEP_ONLY=conflict-list` — **exit 0**, 120 measurements
      across 20 themes, tightest sepia `answered` at 4.61 against a 4.5 floor.
      Screenshots in `docs/screenshots/themes/conflict-list-*.png`.
- [x] UI seen running — the sweep drives a real `git mergetool` over a four-file
      conflict (three text, one binary) in the container and screenshots all 20.
- [x] every Docs-impact "yes" done — README feature row, roadmap mermaid + prose,
      `docs/brand/roadmap.svg`, `docs/security.md` (new subsection),
      `docs/ipc-security.md` (two rows).
- [x] token usage measured — table below.

### Audit round — reviewer + QA agents

Two agents were run over the finished change, one reading and one executing.
The gates they re-ran reproduced exactly (`npm run check` 0, `make e2e` 483,
sweep 120/20). Everything below is what they found BEYOND that, all fixed here.

| #   | severity                | what                                                                                                                                                                                                                                                                                                                                         | found by                                                                                     | fix                                                                                                                                            |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | **data loss**           | A mergetool launch for a file in NO repository left the previous repository's row armed, so the next Save wrote **that** repo's file with text typed for this one — silently destroying its conflict.                                                                                                                                        | QA, by driving a loose file after a repo                                                     | `walkFor` ends the conflict session when `locate()` finds no repo (`mergeRoute.js`)                                                            |
| 6   | **hang**                | The primary **Resolve** button opens the launch's OWN pre-selected row, and `saveMerge` routed on `openRel` alone — writing the file but never releasing the launcher. The terminal then waited out its full two hours, and every later launch for that file hung with no window at all.                                                     | both agents, independently                                                                   | `saveMerge` compares `openRel` to `launchRel` and falls through to the launch's own fence                                                      |
| 7   | behaviour               | Cancelling while an out-of-order row was open wrote `cancelled` for the LAUNCH's file — telling git a file the reader never looked at was declined.                                                                                                                                                                                          | reviewer                                                                                     | `merge:cancel` backs out of the row only when it is not the launch's                                                                           |
| 8   | **shortcut regression** | `CmdOrCtrl+Shift+M` was already Tools ▸ XML. The new View item registered first, silently killing it, and the Shortcuts sheet still advertised the old owner.                                                                                                                                                                                | reviewer                                                                                     | moved to `CmdOrCtrl+Shift+K`, advertised in `shortcuts.js`, and a new **uniqueness test** over `buildMenus` (proven red against the collision) |
| 9   | false promise           | `"Binary — pick a side"` could never work: `runGitIn` returns stdout as a String, so the stage was already a lossy UTF-8 decode and the binary sniff rejected every click.                                                                                                                                                                   | both agents                                                                                  | new `runGitBytesIn`; stages read and written as **bytes**                                                                                      |
| 10  | unusable                | A non-ASCII filename came back from git quoted (`"\303\274…"`), so the row showed octal, was misclassified as binary, and the launch's own file was never found in the list.                                                                                                                                                                 | QA                                                                                           | `-z` on `unmergedArgs()` + `splitNulPaths`                                                                                                     |
| 11  | resource                | The size cap was checked on the Buffer — after an unbounded `readFileSync` had already pulled the whole file into main.                                                                                                                                                                                                                      | reviewer                                                                                     | `statSync` first; `entryFor`'s existing `size` parameter is now actually passed                                                                |
| 12  | UX / convention         | The list re-opened on **every** launch, so a thirty-file walk meant thirty modals; and `.merge-take-btn` was a fourth hand-rolled 19px control box.                                                                                                                                                                                          | reviewer, and noted before the audit                                                         | `dismissed` state (put away once, stays away for the walk); button sized from `--chip-h`                                                       |
| 13  | **broken on Windows**   | `locate()` derived the repo-relative path with `path.relative` over realpath'd ends. Windows hands out an 8.3 temp path (`RUNNER~1`) where git answers with the long one, so the result was a `..`-laden path the fence rejected — **the conflicts list never opened on Windows at all**, silently falling back to the old single-file view. | Windows CI (`check (windows-latest)`); the macOS host and the Linux container both missed it | git names the file itself — `ls-files --full-name -z`; the computation stays only as a fallback for an untracked file                          |

Also closed: the conflict session now ends when the walk finishes or the reader
declines, so `merge:take` / `merge:open` stop being live write handlers into
that repository — `conflicts.end()` was previously dead code its own test
guarded. `conflictSession.js` gained `tests/main/conflictSession.test.js` and
joined the coverage set: it holds both write paths and had none.

**What the reviewer verified clean** (so the next run need not re-tread): all
eight hard security rules, including no path by which a renderer-supplied value
reaches `writeFileSync` — every write is `join(session.root, entry.rel)` with
`rel` from git's own output through `isRepoRelative`, re-verified against
`--diff-filter=U` on both write paths; every ratchet (both `legacySize` entries
genuinely beaten, not relaxed); slice boundaries; i18n extraction.

**Left open, deliberately:** `join(root, rel)` is not realpath-contained, so a
symlinked directory component inside a hostile repository could put a write
outside the root. git's own checkout protections make it hard to reach and no
agent could; recorded rather than fixed under a release.

### Bugs found and fixed while building (before the audit)

| #   | what                                                                                                                                                                                                                                                                                  | found by                                                                    | fix                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | `routeMerge` ran the marker guard BEFORE the already-answered check, so a relaunch for a file resolved out of order was refused with **no sentinel** — hanging the terminal for the launcher's full two hours. The comment above `walkFor` claimed the opposite of what the code did. | `e2e/merge-conflicts-list.spec.mjs` — the one test written for exactly this | walk lookup first, marker guard moved inside `show()`                            |
| 2   | The row's Ours/Theirs used `visibility: hidden`, which takes the buttons **out of the tab order** — so the `:focus-within` rule beside it could never fire and the only way to answer a row was the mouse.                                                                            | e2e click timing out, then reading the CSS                                  | `opacity: 0`, which keeps them focusable                                         |
| 3   | The walk chip read **`6 of 6`** for a four-file conflict: `walkPosition` counts launches this PROCESS has seen, which stops being a position once a second `git mergetool` run happens.                                                                                               | the theme-sweep screenshot                                                  | position/total now come from the list (`walkOf`)                                 |
| 4   | Answering the launch's OWN file from its row wrote the file but left the launch session armed and the launcher waiting on a sentinel that would never come.                                                                                                                           | reading the flow while wiring `merge:take`                                  | the handler spends the session and releases it when the row is the launch's file |

Two ratchets moved, both **downward**: adding a View-menu item pushed
`installMenu` to 116 and `buildMenus` to 144 lines. Rather than raise their
`legacySize` entries, the View submenus were extracted into `viewMenu` /
`viewSection`, which took the functions to **79** and **87** — retightened with
`--retighten`, never raised.

### Token usage

| category    |         tokens |
| ----------- | -------------: |
| input       |            428 |
| output      |        116,302 |
| cache write |        220,100 |
| cache read  |     79,612,876 |
| **total**   | **79,949,706** |

Cache read dominates: it is context re-sent each turn at a fraction of fresh
input, so the total is tokens _processed_, not a cost.

**Outcome:** shipped. `git mergetool` now opens on the list of every conflicted
file; a row can be answered whole-file from the index or opened in the three-way
view, in any order; the take controls are real buttons on the panes' inner
edges; and dismissing the list no longer ends anything — the walk chip, a
toolbar chip and View ▸ Merge conflicts… all bring it back.
