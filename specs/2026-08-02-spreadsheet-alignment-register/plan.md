# Column alignment, materiality tolerance and the change register

|                                         |                                       |
| --------------------------------------- | ------------------------------------- |
| **Status**                              | shipped                               |
| **Progress**                            | 12 / 12 steps                         |
| **Branch**                              | `feat/spreadsheet-rendering-csv-grid` |
| **Started**                             | 2026-08-02                            |
| **Finished**                            | 2026-08-02                            |
| **Bugs found and fixed this iteration** | 2 / 2                                 |
| **Token baseline**                      | 2026-08-02T07:30:00Z                  |
| **Claude tokens used**                  | 44,517,848 — measured                 |

## Problem

The three roadmap Spreadsheet items left open after the rendering work
(commit `429365d`).

1. **6 · Column alignment.** `alignRows` compares cell `i` on the left with
   cell `i` on the right (`changedCells`, `alignRows.js:16`). Insert one column
   and every column after it shifts, so a two-column edit reads as "every cell
   from C onward changed". Repro: left `[Region, Q1, Q2]`, right
   `[Region, Q1, Q2 forecast, Q2]` — 1 real change, N reported.
2. **3 · Materiality tolerance.** `cellsEqual` is exact
   (`alignRows.js:10`), so `1180.0000001` vs `1180` is a change and a rebuilt
   model is a wall of noise. Finance review wants "ignore anything under X".
3. **4 · Change register.** The grid shows changes but there is no way to get
   the list out. The counts in the status band are the only summary, and a
   reviewer wanting "what moved" has to read both grids.

## Solution

**Column alignment** projects both sides into a shared column space before any
existing machinery runs: LCS over the header row gives
`[{ l, r }]` pairs, both sheets' rows are re-indexed through it, and row
alignment, `changedCells` and the grid all keep working on those indices
unchanged. A column present on one side only becomes a ghost column — the same
idea as a ghost row, reported once as a column add/remove rather than as a
change on every row.

**Tolerance** is a comparison option threaded into `cellsEqual`. Both a
absolute floor (rounding noise) and a relative percentage (materiality) are
offered, since finance uses both.

**Change register** is a pure projection of the diff into flat rows, written
out as CSV through the existing export IPC, generalised from
`diff:exportHtml` to one validated handler.

| option                                        | why not                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Align columns inside `alignRows`              | Two alignment problems in one function; `alignRows` already carries the LCS + key-pairing budget logic. Projection keeps each one testable. |
| Align columns by position + fuzzy value match | A header row is the only honest signal for "the same column". Value matching re-derives the row diff and disagrees with it.                 |
| Tolerance in Settings                         | It changes what the diff SAYS, per comparison. Burying it in a global preferences pane hides that; it belongs beside the counts it moves.   |
| A `<select>` for the tolerance                | Would need bespoke select CSS outside `.dialog`. `SegmentedControl.vue` is the repo's one-of-N primitive and already themed.                |
| Change register as HTML / clipboard only      | The reviewer's next step is a spreadsheet. CSV opens there; HTML does not.                                                                  |
| A second `diff:exportCsv` IPC handler         | An identical twin of `diff:exportHtml` — `sonarjs/no-identical-functions`, and two write surfaces to audit instead of one.                  |

## Scope

**In:** column alignment by header + ghost columns; absolute and relative
tolerance; change-register CSV export; the roadmap/README/board updates that
close the Spreadsheet track.

**Out:** aligning columns when there is no header row (falls back to
positional, documented); per-column tolerance; a change register for the text
or tree viewers — the register is a projection of the grid diff, and the other
viewers have no cell coordinates to report.

## Design

No new colour, size or spacing token. Every surface reuses a shipped idiom:

- **Ghost column** — the `.ghost` striping already used for ghost rows:
  `repeating-linear-gradient` over `color-mix(in srgb, var(--border) 55%,
transparent)`. Applied per `<td>`/`<th>` instead of per `<tr>`.
- **Column header state** — the `tr.added` / `tr.removed` tints
  (`--success-text` / `--danger-border` at 16%), applied to the `<th>`.
- **Tolerance** — `SegmentedControl.vue` (`--control-h-sm` segments), placed in
  the status band's right-hand group beside Formulas.
- **Register button** — `.btn.btn-sm` + `<AppIcon name="table" />`, the same
  control as Formulas.

### Theme verdict — all 14

Values parsed from `styles/themes.css` (`scratchpad/grounds.mjs`), never
guessed. Ground is `--bg`. Ghost-stripe and tint figures are region cues, not
text or boundaries — the floor that matters is "distinguishable from the
surface", which the shipped ghost row already sets.

| theme    | ground | ghost stripe / bg | verdict | note                                                                        |
| -------- | ------ | ----------------- | ------- | --------------------------------------------------------------------------- |
| light    | light  | 1.38              | pass    | floating-canvas inversion; unchanged by this work                           |
| dark     | dark   | 1.23              | pass    |                                                                             |
| solar    | light  | 1.20              | pass    | weakest stripe; identical to the shipped ghost row, so no new regression    |
| neon     | dark   | 1.22              | pass    | accent `#22d3ee` untouched — no accent tint added                           |
| nord     | dark   | 1.34              | pass    |                                                                             |
| sepia    | light  | 1.29              | pass    |                                                                             |
| dim      | dark   | 1.20              | pass    |                                                                             |
| beacon   | dark   | 4.96              | pass    | hard keyline `#e0e0e0` on `#000000` — cell borders are kept, never softened |
| meridian | light  | 1.22              | pass    |                                                                             |
| linen    | light  | 1.22              | pass    |                                                                             |
| bloom    | light  | 1.20              | pass    |                                                                             |
| nyan     | dark   | 1.65              | pass    | accent `#ff2ecb` untouched                                                  |
| matrix   | dark   | 1.89              | pass    | accent `#00ff41` untouched                                                  |
| contrast | light  | 4.17              | pass    | hard keyline `#111111` — cell borders kept                                  |

Confirmed by screenshot in the container across light · dark · contrast ·
matrix · nyan · sepia · beacon.

## Security rules touched

- **Rule 3 (renderer never touches Node/Electron)** and the export path. The
  register is built in a pure `utils/` module; only the finished text crosses
  IPC, and only main opens the save dialog and writes.
- **Rule 6 (untrusted input is hostile)** — new. A cell whose value begins
  `=`, `+`, `-` or `@` is a CSV formula-injection payload the moment the
  exported file is opened in Excel, and those values come from a file the user
  did not write. The register escapes them.
- Generalising `diff:exportHtml` keeps ONE write handler; the extension is
  chosen from a fixed allowlist in main, never from the renderer's string.
- No new dependency, no network, no crypto, no external link.

## Test plan

Written before the code.

- **unit** `tests/renderer/utils/alignColumns.test.js` — LCS over headers,
  inserted/removed/reordered columns, the no-header fallback, the width cap.
- **unit** `tests/renderer/utils/alignRows.test.js` — tolerance: absolute,
  relative, non-numeric untouched, sign changes never tolerated.
- **unit** `tests/renderer/utils/spreadsheetDiff.test.js` — an inserted column
  yields one column-add and NOT a change on every row; tolerance is threaded.
- **unit** `tests/renderer/utils/changeRegister.test.js` — A1 refs, sheet
  column, formula/value/error kinds, CSV quoting, formula-injection escaping.
- **unit** `tests/main/exportFile.test.js` — the extension allowlist.
- **e2e** `e2e/spreadsheet.spec.mjs` — a workbook with an inserted column
  reports one added column, not a changed row per line; the tolerance control
  drops a sub-threshold change out of the count.
- **red → green** — item 6 is a defect, so its test is watched failing first.
- **seed fixtures** — `budget-2025.xlsx` gains a column the 2024 file lacks, so
  `make local-seed` opens a real column-insert case by hand. `seed` tag
  unchanged; `local-seed-clean` still keys off it.

## Docs impact

| surface                  | needed? | what changes                                                                         |
| ------------------------ | ------- | ------------------------------------------------------------------------------------ |
| `README.md`              | yes     | the Excel row gains column alignment, tolerance and the register                     |
| `docs/screenshots/*.png` | yes     | `spreadsheet-diff.png` — the status band gains two controls and the seed data shifts |
| `docs/roadmap.md`        | yes     | the Spreadsheet track closes: 3 · 4 · 6 move open → done                             |
| `docs/brand/roadmap.svg` | yes     | same move — the card goes to 0 open                                                  |
| `docs/ipc-security.md`   | yes     | `diff:exportHtml` becomes `diff:exportFile` in the flow + table                      |
| `docs/security.md`       | no      | no crypto, key, or sealing behaviour changes                                         |
| `docs/glossary.md`       | no      | no new user-facing vocabulary beyond the controls' own labels                        |
| `docs/standards.md`      | no      | no new rule; this follows the existing adapter/util/band rules                       |

## Implementation plan

- [x] 1. Failing test: an inserted column marks every later cell changed
- [x] 2. `utils/alignColumns.js` — LCS over headers, positional fallback, cap
- [x] 3. Project both sheets through the column map in `spreadsheetDiff`
- [x] 4. Ghost columns + column state in `SpreadsheetGrid` / its CSS
- [x] 5. Tolerance in `cellsEqual` / `changedCells`, threaded through options
- [x] 6. Tolerance control in the viewer via `SegmentedControl`
- [x] 7. `utils/changeRegister.js` — flat rows + CSV with injection escaping
- [x] 8. Generalise `diff:exportHtml` → `diff:exportFile` (main + preload + store)
- [x] 9. Register button in the viewer
- [x] 10. Seed fixture: a real column insert between the two budgets
- [x] 11. Docs: README, roadmap.md, roadmap.svg, ipc-security.md
- [x] 12. `npm run check`, `make e2e`, screenshots re-captured

## Decisions

| date       | decision                                                             | why                                                                                                                                             | rejected                                    |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 2026-08-02 | Built without a separate approval round                              | The user instructed "implement undone work" directly after approving the shipped half                                                           | Presenting the plan as `draft` and waiting  |
| 2026-08-02 | Same branch as the rendering work                                    | Direct overlap: same files, and the register cannot be built without the formula/error cell metadata that branch introduced                     | A second branch off an unmerged one         |
| 2026-08-02 | A one-sided column is a column add/remove, not a change on every row | Reporting N row changes for one inserted column is the very noise item 6 exists to remove                                                       | Counting each cell in the column as changed |
| 2026-08-02 | Tolerance offers both an absolute floor and a percentage             | 0.01 kills float-rounding noise; a percentage is what materiality actually means. Neither alone covers the other                                | A single absolute number                    |
| 2026-08-02 | Row 0 is the header; no header row means positional columns          | Guessing which row is a header from content is a heuristic that fails silently. Positional is the current behaviour, so the fallback is a no-op | Sniffing the header row                     |

## Validation

- [x] `/validate` — no findings outstanding; full report in `quality-audit.md`.
      Nine prose comments swept, conventions and all eight security rules clean.
- [x] `npm run check` — exit 0. `Tests 1786 passed | 2 skipped (1788)`;
      coverage `95.27 | 88.42 | 94.51 | 96.32` against floors `93 | 86 | 92 | 95`.
- [x] UI seen running — `make e2e` **267 passed, 2 skipped, 0 failed**, plus
      container screenshots on light · dark · contrast · matrix · nyan · sepia ·
      beacon. Two layout defects were found that way and fixed (see Decisions).
- [x] every Docs-impact "yes" done: README (feature row + screenshot alt),
      `spreadsheet-diff.png` re-captured, `roadmap.md` + `roadmap.svg` closed the
      track, `ipc-security.md` gained the export-allowlist row.
- [x] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since 2026-08-02T07:30:00Z
```

| category    |     tokens |
| ----------- | ---------: |
| input       |        238 |
| output      |     98,717 |
| cache write |    466,993 |
| cache read  | 43,951,900 |
| **total**   | 44,517,848 |

**Outcome:** the Spreadsheet track is closed. Cache read is 98.7% of the total —
context re-sent each turn, not work done; `output` + `cache write` (~566k) is
the honest measure. The expensive parts were the two verification loops that
found real defects: the 14-theme contrast sweep (three breaks) and the container
screenshots (two layout collisions), neither of which any test would have
caught.
