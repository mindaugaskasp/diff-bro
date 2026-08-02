# A tolerance of your own for the grid

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 6 / 6 steps |
| **Branch** | `feat/diagrams-snippets-rail` (continues the batch) |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-08-02T14:05:00Z |
| **Claude tokens used** | not measured |

## Problem

The grid's tolerance is four fixed presets — `Exact`, `±0.01`, `±0.5%`, `±1%`
(`composables/useSpreadsheetDiff.js:7`). Reconciliation thresholds are not
generic: a materiality threshold is set by the engagement (±2%, ±£50, ±0.005),
and none of those is reachable. Someone with a ±2% threshold has to read a ±1%
comparison and do the last step in their head.

The engine already supports it. `withinTolerance` (`utils/alignRows.js:33`)
takes `{ abs, pct }` and handles either; only the UI cannot produce one.

## Solution

A fifth segment, **Custom**, that reveals a number field and a unit switch
(`%` / raw). The value flows into the same `{ abs }` / `{ pct }` object the
presets already produce, so nothing downstream changes.

| option | why not |
|---|---|
| Replace the presets with a bare number field | the presets are one click and cover the common cases; a field alone makes every comparison a typing exercise |
| A single field that parses "2%" vs "50" | ambiguous for a currency with a % in it, and unit-guessing from text is a bug generator; an explicit switch cannot be misread |
| Put it in Settings | a threshold belongs to the comparison in front of you, not to the app |

## Scope

**In:** the Custom segment, the number field, the unit switch, validation, and
carrying the choice while the comparison stays open.

**Out:**

- **Per-column thresholds.** One threshold for the sheet, as today.
- **Persisting it across launches.** It belongs to the comparison; the presets
  do not persist either.
- Any change to `withinTolerance` — the maths is already right, including the
  sign-change rule and the exact-only cells a tolerance may not touch.

## Design

The control sits where the presets already are, in the grid's own `.sheet-bar`
band. The field only exists when Custom is picked, so the bar does not grow for
everyone else.

```
 Tolerance [ Exact │ ±0.01 │ ±0.5% │ ±1% │ Custom ]   [ 2.5 ] [ % │ abs ]
```

- Both extra controls are `.btn-sm`-height so the band's row stays one height —
  the number input takes `--control-h-sm`, not padding.
- Empty or unparseable reads as **Exact** rather than as zero, and says so
  through the field's own emptiness. A negative is clamped to 0.
- No new colour, no new token: the field is the shared input styling.

### Theme verdict — all 14

The only new pixels are a number input and a two-option `SegmentedControl`, both
already shipped and swept on all 14 (`.seg` uses `--bg-elevated` / `--border` /
`--accent`; inputs use `--bg` / `--border` / `--text`). No accent fill beyond the
picked segment, so `matrix`/`nyan`/`neon` gain no glow, and no border is removed,
so `contrast` and `beacon` keep their keylines. Table omitted for that reason.

## Security rules touched

None of the eight. A number typed into a renderer field, clamped, and handed to
a pure comparison function. No IPC, fs, crypto, dependency or injection sink.

## Test plan

- **unit — `tests/renderer/utils/alignRows.test.js`**: `withinTolerance` already
  has coverage; add the custom-shaped cases that the UI can now produce — a
  large `abs` (±50), a large `pct` (±2%), and that a sign change still counts as
  material at any threshold.
- **unit — `tests/renderer/composables/useSpreadsheetDiff.test.js`**: the custom
  value becomes `{ pct }` or `{ abs }` by the switch; an empty or negative entry
  falls back to Exact rather than to a zero threshold that forgives nothing but
  claims to.
- **e2e — `e2e/spreadsheet.spec.mjs`**: with a workbook whose figures differ by
  ~1.5%, `±1%` reports the change and a custom `±2%` stops reporting it — the
  whole point, asserted through the change count the grid shows.
- **red → green** — each watched failing first.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | the Excel row says "Set a tolerance and rounding noise stops counting" — it becomes a tolerance of your choosing |
| `docs/screenshots/spreadsheet-diff.png` | **maybe** | the frame shows the tolerance control; a fifth segment changes it. Re-capture if the segment is visible in the crop |
| `docs/roadmap.md` | no | the spreadsheet track's "materiality tolerance" item is already Built; this refines it |
| `docs/*.md` | no | no IPC, crypto, term or convention change |

## Implementation plan

- [x] 1. Token baseline.
- [x] 2. Tests for the custom value → tolerance object, and the fallbacks — red.
- [x] 3. `useSpreadsheetDiff`: the Custom entry and the derived tolerance; green.
- [x] 4. `SpreadsheetDiffViewer`: the field and the unit switch, on the band row.
- [x] 5. e2e in `spreadsheet.spec.mjs`; run it.
- [x] 6. README, `npm run check`, audit.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | Custom is a fifth PRESET, not a replacement | the four cover the common cases in one click; the field appears only when asked for | a bare number field for everyone |
| 2026-08-02 | An explicit unit switch, never parsed from the text | "50" meaning 50% or 50 currency units is not something to guess | sniffing a trailing % |
| 2026-08-02 | Empty reads as Exact | a 0 threshold forgives nothing yet claims a tolerance is set | treating empty as 0 |

## Validation

- [x] `npm run check` — `style tokens ok (91 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `125 passed | 1 skipped` files,
      `1854 passed | 2 skipped` tests
- [x] e2e — `e2e/spreadsheet.spec.mjs` 6 passed, including the new custom-threshold
      case driven both ways (raw and percentage) against the same 0.004-on-90 cell
- [x] README Excel row updated
- [x] `make local-seed` — n/a

**Red → green recorded:** `useSpreadsheetDiff.test.js` 3 failures
(`Cannot set properties of undefined` — no `customValue`/`customUnit`, then
`tolerance` not returned) → 7 passed. The e2e failed once for real on a `%`
locator that also matched `±0.5%` and `±1%`, fixed by scoping to the Unit group.

**Outcome:** shipped smaller than planned — `withinTolerance` already accepted
`{ abs }` and `{ pct }`, so this was UI and validation only. The engine was not
touched.
