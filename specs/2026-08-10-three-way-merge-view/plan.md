# A real three-way merge view

|                                         |                             |
| --------------------------------------- | --------------------------- |
| **Status**                              | in-progress                 |
| **Progress**                            | 9 / 9 steps                 |
| **Branch**                              | `feat/three-way-merge-view` |
| **Started**                             | 2026-08-10                  |
| **Finished**                            | —                           |
| **Bugs found and fixed this iteration** | 0                           |
| **Token baseline**                      | —                           |
| **Claude tokens used**                  | —                           |

## Problem

v0.4.29 shipped a merge **resolver**, not a merge **view**. One card per conflict
with four buttons, no line-level context, no navigation, no editing. Asked to
resolve `config.yml`, it shows two blocks of three lines and offers Ours /
Theirs / Both / Neither.

That was my scoping call — `specs/2026-08-09-developer-workflow/plan.md` records
"three-way merge as a full editor | out" as a decision — and it is the wrong one.
The reference every developer has is JetBrains: three panes, the result in the
middle, per-hunk chevrons in the gutters, and the result editable by hand when
neither side is right. A merge tool that cannot express "take theirs, then fix
the indentation" sends you to another editor at exactly the moment it promised
not to.

Two smaller failures fall out of the same design:

- **The ancestor is thrown away.** `mergeConflicts.js` parses a diff3 base when
  git happens to write one, and nothing renders it. Which side _changed_ is the
  first question in a merge and the view cannot answer it.
- **Markers are the wrong source.** Parsing `<<<<<<<` out of `$MERGED` is
  reconstructing what git already holds. The index carries the three inputs
  cleanly, verified on a real conflict:

  ```
  $ git show :1:config.yml   # base    → replicas: 3, region: eu-west-1, timeout: 30
  $ git show :2:config.yml   # ours    → replicas: 5, region: us-east-1, timeout: 30
  $ git show :3:config.yml   # theirs  → replicas: 9, region: eu-west-1, timeout: 90
  ```

## Solution

**Three Monaco panes: Ours │ Result │ Theirs, with the result editable.**

Inputs come from the index (`:1:`, `:2:`, `:3:`), so all three texts arrive
without a marker in them. Conflict regions are computed from those three rather
than scraped, which is also what makes the ancestor available.

Monaco ships **no three-way merge editor** — VS Code's is internal and not part
of `monaco-editor` — so it is composed from three ordinary editors plus
decorations. That is the central cost of this proposal and the main risk.

| option                                                   | why not                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| keep the dialog, add a diff pane inside it               | the dialog is the wrong container: a merge needs the window, and `BaseDialog` is capped for a reason                                                |
| two stacked `createDiffEditor`s sharing the centre model | Monaco's revert arrow reverts _modified → original_, so "accept theirs" would need Theirs on the left of its own pane. The layout fights the widget |
| VS Code's merge editor                                   | not exposed by `monaco-editor`. Vendoring it is a fork, not a dependency                                                                            |
| keep parsing markers                                     | the index is the source of truth, and markers cannot give the ancestor unless the user set `merge.conflictStyle=diff3`                              |
| a new dependency for three-way merge                     | rule 2. The algorithm is already in `mergeConflicts.js`; what is missing is a view                                                                  |

## Scope

**In:**

- `readStageArgs(stage, path)` in `gitRepo.js` — `:1:`/`:2:`/`:3:` from the
  index. `stage` is a literal the app chooses, never renderer input
- three-way region model from three texts (extends `mergeConflicts.js`, keeps
  the marker parser as the fallback)
- `MergeView.vue` — full-area, replacing the dialog: three panes, scroll-synced
- glyph-margin actions per region: take ours · take theirs · both · neither
- an EDITABLE result pane (`useMonacoInput` already does this)
- next/previous conflict, and a status band counting what is left
- the save guard changes — see Decisions

**Out:**

- word-level merge within a line — hunk granularity, as JetBrains defaults to
- editing Ours or Theirs; they are what the two commits said
- resolving a binary conflict, which stays refused
- a merge that is not a `git mergetool` launch; nothing gains a "merge two
  arbitrary files" entry point

## Design

Chrome is tokens; the panes are Monaco, themed through `applyMonacoTheme` as the
diff view already is. Region tints use `--dg-add` / `--dg-del` / `--dg-chg`,
which `check-theme-depth` already holds to a contrast floor **and** a pairwise
ΔE floor across all 20 themes — the same three the diagram view leans on.

```
┌ band ──────────────────────────────────────────────────────────────┐
│ config.yml            ‹ prev   next ›        2 of 3 resolved   Save │
├──────────────────┬──────────────────────────┬──────────────────────┤
│ Ours (read-only) │ Result (EDITABLE)        │ Theirs (read-only)   │
│                  │                          │                      │
│ replicas: 5    » │ replicas: 5              │ «  replicas: 9       │
│ region: us-east» │ region: us-east-1        │ «  region: eu-west-1 │
│ timeout: 30    » │ timeout: 90              │ «  timeout: 90       │
│                  │ ^ hand-edited            │                      │
└──────────────────┴──────────────────────────┴──────────────────────┘
```

`»` and `«` are glyph-margin actions, not text — `<AppIcon>` geometry rendered
into Monaco's glyph margin, so nothing tofus.

### Theme verdict — all 20

The panes are Monaco surfaces, so the question is what the DECORATIONS compose
against Monaco's themed ground, not what a `.css` background does. Values parsed
from `styles/themes.css` + `tokens.css`.

`--dg-add` is `--success-text`; `--dg-del` is `color-mix(--danger-border 70%,
--text)` — that mix exists because nord's raw danger token scored 2.24; `--dg-chg`
is `--warning-border`, overridden on nord, contrast and vector.

| theme    | ground    | verdict | note                                                    |
| -------- | --------- | ------- | ------------------------------------------------------- |
| light    | `#ffffff` | ok      | region tints at 14%, the step the grid already uses     |
| dark     | `#0d1117` | ok      |                                                         |
| solar    | `#fffdf6` | ok      |                                                         |
| neon     | `#090d18` | ok      | accent only on the focus ring                           |
| nord     | `#2e3440` | ok      | `--dg-del`'s mix is why this passes at all              |
| sepia    | `#e9dcbe` | ok      |                                                         |
| dim      | `#1b1917` | ok      |                                                         |
| beacon   | `#000000` | ok      | hard keyline `#e0e0e0` — pane dividers keep `--border`  |
| meridian | `#f5f7f4` | ok      |                                                         |
| linen    | `#faf7f0` | ok      |                                                         |
| bloom    | `#f9f4f5` | ok      |                                                         |
| nyan     | `#160a20` | ok      | accent `#ff2ecb`, no glow, no accent fill under a label |
| matrix   | `#020a04` | ok      | accent `#00ff41`, same                                  |
| contrast | `#ffffff` | ok      | hard keyline `#111111`; `--dg-chg` overridden here      |
| volcano  | `#000000` | ok      |                                                         |
| amber    | `#0f0a02` | ok      |                                                         |
| tide     | `#0b1a1e` | ok      |                                                         |
| ember    | `#1a1013` | ok      |                                                         |
| graphite | `#161616` | ok      | achromatic ground, semantic tints carry the meaning     |
| vector   | `#ffffff` | ok      | `--dg-chg` overridden here                              |

**This table is not the check.** The new surface goes into `theme-sweep`'s
`SURFACES` and is read off real frames, because the audit found the last two new
surfaces failing the reading floor on 14 of 20 themes with a table just like this
one saying "ok".

## Security rules touched

Nothing new is opened.

- **The write is unchanged.** `merge:write` already takes TEXT and main already
  holds `$MERGED` from launch, so an editable pane needs no new IPC and no new
  argument. This is why "freely editable" costs nothing here: the renderer could
  already send arbitrary text.
- **Rule 7.** `readStageArgs` is one more argv builder inside the existing fence:
  fixed argv, no shell, `--end-of-options`, the same hardening. `stage` is one of
  three integers chosen by the app — it is never a string from anywhere.
- **Rule 6.** Three texts from the index are still untrusted input; the existing
  binary refusal applies to each, and the region model is capped.

## Test plan

- **unit** — `mergeThreeWay.test.js`: regions from three texts; a region only one
  side changed (auto-mergeable, not a conflict); both sides identical; one side
  deleted; CRLF preserved; the marker parser still used when stages are absent
- **unit** — `gitRepo.test.js`: `readStageArgs` refuses a stage outside 1–3 and
  builds `:2:path` with the path fenced as before
- **unit** — `useMergeRegions` composable: next/prev wrapping, region → line
  range after an edit shifts the text
- **e2e** — `merge-resolve.spec.mjs` (11): a real conflict through
  `git mergetool`; take a side, take from a gutter chevron, TYPE the answer,
  save, assert the bytes on disk. Plus: the sides come from the index and not the
  markers · the branches are named · the three panes fill one full-height row ·
  the split is draggable and remembered · declining leaves the file untouched ·
  a binary or marker-free file is refused
- **e2e** — `merge-many.spec.mjs`: a 30-file conflict walked to the end
- **theme-sweep** — a `merge-view` entry in `SURFACES`

## Docs impact

| surface                                 | needed? | what changes                                             |
| --------------------------------------- | ------- | -------------------------------------------------------- |
| `README.md`                             | **yes** | the Merge conflicts row describes a dialog               |
| `docs/screenshots/*.png`                | **yes** | a new full-area view is a new frame                      |
| `docs/roadmap.md` + `brand/roadmap.svg` | **yes** | Developer workflow gains a row                           |
| `docs/security.md`                      | **yes** | one line: the result is editable, the write is not wider |
| `docs/standards.md`                     | **no**  | no new convention                                        |

## Implementation plan

- [x] 1. `readStageArgs` + the index reader, with the marker parser as fallback
- [x] 2. Regions from the markers, both SIDES from the index — see Decisions
- [x] 3. Region ↔ line mapping under edits, via Monaco's own decoration ranges
- [x] 4. `MergeView.vue` shell: three panes, scroll sync, status band, walk counter
- [x] 5. Glyph-margin chevrons, region decorations, intra-line word tints, ruler marks
- [x] 6. The editable result; typing inside a region answers it
- [x] 7. Retire `MergeDialog`; route the merge session to the view
- [x] 8. `SURFACES` entry + measured on all 20 (1260 measurements, green)
- [x] 9. e2e, docs, roadmap + SVG

## Decisions

| date       | decision                                                                  | why                                                                                                                                                                                                                                                                                                                                                           | rejected                                                                       |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2026-08-10 | the result pane is freely editable                                        | the user's call, asked and answered. "Take theirs, then fix the indentation" is the case a resolver cannot express                                                                                                                                                                                                                                            | read-only result composed from choices                                         |
| 2026-08-10 | **the save guard changes meaning**                                        | with free editing, "every region answered" is no longer the truth — a hand-edited result can be complete with regions never touched, and a fully-answered one can still have markers typed back in. Save blocks on MARKERS PRESENT in the result, and warns (does not block) on untouched regions                                                             | keeping `unresolvedCount` as the gate, which would be wrong in both directions |
| 2026-08-10 | inputs come from the index, markers are the fallback                      | the index is what git actually holds, and it is the only way to get the ancestor without the user having set `merge.conflictStyle=diff3`                                                                                                                                                                                                                      | marker parsing only                                                            |
| 2026-08-10 | compose three editors rather than adopt a merge widget                    | Monaco exposes none; VS Code's is internal                                                                                                                                                                                                                                                                                                                    | vendoring VS Code's merge editor                                               |
| 2026-08-11 | **regions come from the MARKERS; only the two SIDES come from the index** | a deviation from "regions computed from three texts". git already decided where the conflicts are — recomputing them from three texts would be a second, disagreeing opinion, and where it disagreed the view would offer a choice git will not accept. The index still supplies both sides as whole marker-free files, which is what the panes needed it for | a three-way region model recomputed in the renderer                            |
| 2026-08-11 | **the save guard is explicit region state, not a marker scan**            | with no markers anywhere in the result there is nothing left to scan for. A region is unresolved until it is answered — by a button, a chevron, or an edit landing inside it                                                                                                                                                                                  | blocking on `<<<<<<<` present in the result                                    |
| 2026-08-11 | typing inside a region resolves it                                        | JetBrains' model, and the hole the button-only guard left: a reader who typed the whole answer still had to press something before Save unlocked                                                                                                                                                                                                              | requiring an explicit "keep this" action                                       |
| 2026-08-11 | the ancestor is read but not shown                                        | `:1:` arrives in the payload and the store holds it; a fourth pane is a different design question and three panes is what JetBrains defaults to                                                                                                                                                                                                               | a base pane in this change                                                     |
| 2026-08-11 | pane widths are FRACTIONS with five grid tracks                           | the grips are grid children as much as the panes are; three tracks for five children wrapped the last pane onto a row of its own, which is what "the result pane is glued to the bottom" was                                                                                                                                                                  | pixel widths, or absolutely-positioned grips                                   |

## Validation

- [x] `/validate` — folded into `/audit` below
- [x] `npm run check` — green, with the coverage floors RAISED (94/87/95/95 →
      95/88/95/96) rather than met: `useMergePanes.js` was 4.85% covered, so its
      testable core moved to `mergePaneOps.js` and is now driven by fakes
- [x] `/audit` — two agents. Between them and a read of my own, **nine** defects,
      four of them data loss. Every one is fixed and guarded except the last: 1. an empty region read as a one-line one, so taking a side ate the stable
      line after it — found by reading, e2e-guarded 2. the same region answered twice ate the line below, because Monaco grows
      a decoration around inserted text differently from this convention.
      The unit test passed the first fix; only real Monaco caught it 3. undo left the cached emptiness disagreeing with the text, so the next
      answer went in ABOVE the restored lines. Emptiness is no longer cached 4. typing into an emptied region never unlocked Save, and that region has
      no chevron to click instead 5. F7/Shift+F7 never reached the view — Monaco owns both keys 6. no chevrons, bands or word tints at all in a CRLF repository 7. the index stage reads had no size cap and no binary sniff 8. `mergeInputsFor` had no `.catch()`, leaving `git mergetool` blocked 9. **still open, pre-existing**: a file whose ordinary text contains
      marker-shaped lines (a doc about conflicts) has them parsed as real
      conflicts, and answering them drops one side. Inherent to every
      marker-based merge tool, and true on `main` today — filed, not fixed
      here
- [x] read on all 20 themes off real frames — `make theme-sweep`, 1260
      measurements, green. Getting there fixed two pre-existing breaks in the
      sweep itself: `status-band` had been timing out since `deps-diff` was added
      ahead of it and cleared the comparison, and a launcher hidden by something
      else taking focus HANGS the screenshot rather than failing it
- [x] Windows still unverified — no host. Said, not implied. E2E ran on macOS
      only; `e2e/quick-look-window-recovery.spec.mjs` is darwin-gated and was not
      exercised this round

**Outcome:** shipped. The merge is a view rather than a resolver: three panes,
the middle one a real editor, sides named by branch and read from the index.
Two known limitations, both stated in the UI or here rather than hidden — a
mixed-ending file is normalised on save (Monaco keeps one EOL per model, and the
band says so before anything is written), and item 9 above.
