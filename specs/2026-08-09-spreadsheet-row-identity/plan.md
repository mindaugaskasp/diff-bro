# Row identity and the header row — the Spreadsheet track's "now"

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 14 / 14 steps |
| **Branch** | `improvement/spreadsheet-row-identity` |
| **Started** | 2026-08-09 |
| **Finished** | 2026-08-09 |
| **Bugs found and fixed this iteration** | 3 code · 5 more found by `/validate` |
| **Token baseline** | 2026-08-09T17:38:10Z |
| **Claude tokens used** | 34,849,636 processed (171 requests) |

## Problem

`docs/roadmap.md` reopened the Spreadsheet track against _data_ rather than a
model, and put two items in **now**. Both are live defects, not wishes.

**1 · row identity.** `opts.keyColumn` exists at `spreadsheetDiff.js:78` with no
UI, takes exactly one column, and is only consulted _inside an LCS gap_
(`alignRows.js:114`). The outer pairing is an LCS over whole-row signatures
(`alignRows.js:202`), so re-sorting an export re-orders every signature and the
LCS finds almost no common subsequence:

```
left           right (same data, sorted by amount)
1001, 500      1003, 120
1002, 300      1002, 300
1003, 120      1001, 500
```

Today: `same, changed(1002 stays), same` at best, and on a real 400-row trial
balance sorted by a different column it reads as near-100% changed. There is no
way to say "row identity is the account code" — nor to say it is
*account + cost centre*, which is what a GL export actually keys on.

**2 · header row offset.** `alignColumns.js:16` reads `rows[0]`. A workbook whose
first row is a title — `Trial balance as at 31 Dec 2025` in A1 and nothing else —
produces labels `['Trial balance…', '', '', '']`, which fails `usable()`
(`alignColumns.js:27`, blank label) and falls to `positional()`. Positional
pairing is exactly the failure the file's own header comment says it was written
to prevent: one inserted column then shifts every column after it. It fails
**silently** — nothing in the UI says the columns were paired by position.

Neither has a test that would catch it, because neither was ever expressible.

## Solution

Two independent changes plus one UI surface.

**Header row (2).** `alignColumns` scans the first `MAX_HEADER_SCAN` rows for the
first row whose labels are `usable()`, instead of reading `rows[0]` and giving
up. Each side scans independently — a title row added on one side only is the
common case. The detected index is exported so the viewer can say which row it
used when it is not row 1. The existing `paired * 2 > narrower` guard still
rejects a data row that happened to look usable, so the scan is strictly better
than the current behaviour: it only runs where the current code already gave up.

**Row identity (1).** A new pure `utils/matchRowsByKey.js` pairs rows by a
composite key across the WHOLE sheet, bypassing the LCS. `spreadsheetDiff`
branches on `opts.keyColumns` (an array of paired-column indices): empty → today's
`alignRows`, non-empty → key matching. Duplicate keys pair in order of
occurrence and are counted, so the answer is never silently wrong.

**Output order** follows the RIGHT file — the one the reader has open — with a
removed row emitted just before the first surviving left row that followed it.

**UI.** A `RowMatchMenu.vue` in the grid-tools band: a `.btn btn-sm` with a count
chip, opening the shared `.popover` layer with one checkbox per paired column,
plus the duplicate-key warning. Per sheet, because column headers are.

| option | why not |
|---|---|
| key matching inside `alignRows` | the file is 214 lines against a 250 cap, and the two matchers share nothing but the entry shape — one `if` at the top of a second matcher is honest, a mode flag threaded through `lcsOps`/`emitGap` is not |
| sort both sides by key, then align positionally | throws away the reader's own row order; a diff they cannot line up against the file on their screen |
| auto-detect the key column (first column with unique values) | a plausible guess that is wrong invisibly — an `id` column that is unique on the left and duplicated on the right silently changes what "changed" means. Recorded as out of scope, not rejected forever |
| header row as a user-set number | the detection is unambiguous where it matters (blank/duplicate labels vs. a clean header). A control for it is chrome for a case the scan already covers; revisit if the scan is ever seen picking wrong |
| a `BaseDialog` for the key picker | it is a one-of-N-columns choice made while looking at the grid, which is what `.popover` is for (`ViewOptionsMenu`) — a modal would cover the columns being chosen |

## Scope

**In:**

- header-row scan in `alignColumns.js`, exported index, surfaced in the status band
- `utils/matchRowsByKey.js` — composite keys, duplicate detection, right-file order
- `spreadsheetDiff` branch on `opts.keyColumns`; `headerRows` + `duplicateKeys` on the sheet result
- `useSpreadsheetDiff` — per-sheet key selection
- `RowMatchMenu.vue` + its stylesheet; the count chip lifted to `ui.css` as `.btn-count`
- i18n catalogue + `en-XA`; seed pair; unit + e2e tests; roadmap prose + SVG
- **added mid-build, on request:** the hovered row marked in BOTH grids — see Decisions

**Out:** *(recorded, not drifted into)*

- **Δ and net variance** (roadmap item 4) — the register keeps its six columns
- **amounts read as amounts** (item 3) — `numfmt.js` untouched
- auto-detecting a key when none is chosen — Auto stays exactly today's LCS
- case-folding or numeric coercion of key values — see Decisions
- `keyColumn` (singular) on `alignRows` stays as-is; it is the in-gap pairing and
  is still what Auto uses

## Design

The trigger is `.btn .btn-sm` from `ui.css` — the resting three-cue face
(`--btn-face` / `--btn-edge` / `--shadow-1`), never `.btn-ghost`: it stands alone
in the band with no primary beside it. Panel is the shared `.popover`
(`--bg-elevated`, `1px solid var(--border)`, `--radius-lg`, `--shadow-2`), rows
are `.popover-row` at `--control-h`. The count chip is `--chip-h` with a
`--btn-face-press` face and `--text` ink — moved verbatim out of
`ViewOptionsMenu.css` into `ui.css`, because a second component now needs it and
a scoped copy is this repo's recurring drift.

Secondary text inside the panel (the Auto explanation, the duplicate-key warning)
is `--text-hint`, **not** `--text-dim`: dim's 3.0 floor is held against
`--bg-panel` and this panel is `--bg-elevated`, where `make theme-sweep` measured
2.92 on nord and 2.82 on sepia. `ui.css` already records that.

The header-row note in the status band is plain `--text-dim` body text in the
existing `.status-band`, which is `--bg-panel` — the floored pair.

No new colour, radius or font-size literal; nothing accent-filled behind a label;
no glow.

### Theme verdict — all 20

Parsed from `styles/themes.css` (`--bg` for the ground, `--border`, `--accent`).
Every surface here is an existing `ui.css` layer already held to floors by
`check-theme-depth.mjs`, so the verdict is about what the new markup composes,
not a new palette.

| theme | ground (`--bg`) | verdict | note |
|---|---|---|---|
| light | `#ffffff` (canvas inverted) | ok | popover is `--bg-elevated`, floats on the tinted canvas as every other panel does |
| dark | `#0d1117` | ok | |
| solar | `#fffdf6` | ok | |
| neon | `#090d18` | ok | accent `#22d3ee` only on the checkbox tick and `:focus-visible` — no fill under a label, nothing to halo |
| nord | `#2e3440` | ok | `--text-hint` chosen for exactly this theme (dim measured 2.92 here) |
| sepia | `#e9dcbe` | ok | as nord — dim measured 2.82 |
| dim | `#1b1917` | ok | accent `#d9a441` |
| beacon | `#000000` | ok | hard keyline `#e0e0e0` — popover keeps its `1px solid var(--border)`; nothing here removes a border |
| meridian | `#f5f7f4` | ok | |
| linen | `#faf7f0` | ok | |
| bloom | `#f9f4f5` | ok | |
| nyan | `#160a20` | ok | accent `#ff2ecb` — tick and focus ring only |
| matrix | `#020a04` | ok | accent `#00ff41` — same |
| contrast | `#ffffff` | ok | hard keyline `#111111`, kept |
| volcano | `#000000` | ok | border `#ffc9a4`, accent `#ff5c33` |
| amber | `#0f0a02` | ok | accent `#ffb000` |
| tide | `#0b1a1e` | ok | |
| ember | `#1a1013` | ok | |
| graphite | `#161616` | ok | achromatic; chip face is `--text` at 30%, so it steps toward the ink rather than picking a grey |
| vector | `#ffffff` | ok | |

**The row-hover mark** is the one genuinely new painted surface, so it was read
off real frames rather than reasoned about: a 2px `--accent` outline inset into
the row, plus `--bg-hover` on the gutter. Captured from a running app on
**light · matrix · beacon · contrast · sepia · nyan · volcano** — the two hard-keyline
contracts, the three high-chroma accents, and one light warm ground. At 1px it
read as "a slightly different border" on beacon (`#4cc2ff` beside a `#e0e0e0`
keyline) and contrast; 2px at `-2px` offset separates the mark from the keyline
and reads on all of them. It never removes a border, never fills behind a label
and never glows, so the three rules the high-chroma themes exist to catch do not
apply.

Verified by `npm run check:themes` (token floors, 20 themes, green) and re-read in
the running app before the plan closed.

## Security rules touched

**None crossed.** No IPC handler, no fs, no crypto, no `shell.*`, no new
dependency, no external link, no `v-html`. Everything added is renderer-side pure
JS over data the main process already parsed and validated.

Two adjacent rules stay honoured:

- **Rule 6 (untrusted input is hostile).** Key values come from cells in a file a
  user chose. They are used only as `Map` keys and rendered through Vue text
  interpolation — never as a selector, a path or markup. The composite key joins
  on `\u0000` (NUL), which cannot appear in a spreadsheet cell's text, so two different
  key tuples cannot collide into one.
- **Rule 6 again, caps.** The header scan is capped (`MAX_HEADER_SCAN`), the key
  picker only lists paired columns and the popover scrolls rather than growing
  without bound. Key matching is O(n) hashing — cheaper than the LCS it replaces,
  so no new budget is needed.

## Test plan

Written before the code; each of the two defects gets its failing test first.

- **unit** — `tests/renderer/utils/alignColumns.test.js`: a title row above the
  header pairs by header, not by position (**red first**: today it returns
  `positional()`); a header found at row 2 on the left and row 0 on the right
  still pairs; nothing usable in the first ten rows still falls back; a data-only
  sheet is unchanged.
- **unit** — `tests/renderer/utils/matchRowsByKey.test.js` (new): re-sorted rows
  all pair (**red first**: `alignRows` on the same input reports changes);
  composite key over two columns; a duplicate key pairs in order of occurrence
  and is counted; unmatched left → removed, unmatched right → added; tolerance is
  respected; the emitted order follows the right file with removed rows in place;
  a blank key is a key, not a wildcard.
- **unit** — `tests/renderer/utils/spreadsheetDiff.test.js`: `opts.keyColumns`
  reaches the matcher and the reported `changed` indices are still in DISPLAY
  column space; `headerRows` and `duplicateKeys` on the sheet result.
- **unit** — `tests/renderer/composables/useSpreadsheetDiff.test.js`: key columns
  are per sheet and survive a sheet switch; clearing returns to Auto.
- **e2e** — `e2e/spreadsheet.spec.mjs`: build a re-sorted pair with a title row,
  open it, assert the grid reports the sheets as near-fully-changed under Auto,
  pick the key column in the Match-rows popover, assert the change count collapses
  to the one real edit. The popover, the per-sheet memory and the real parse only
  exist in a launch.
- **red → green** — recorded per test in the Validation section with the actual
  failure text.
- **seed fixtures** — `scripts/seed-local.mjs` `FILES` gains
  `ledger-before.xlsx` / `ledger-after.xlsx`: a title row in A1, a header on row
  2, the same twelve ledger lines re-sorted, one amount moved and one line
  dropped. Without it neither defect is reproducible by hand on the host Mac.
  Keeps the `seed` tag; `local-seed-clean` removes it by the same glob.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | the spreadsheet feature list says columns pair by header; it now also says rows can pair by key columns |
| `docs/screenshots/*.png` | **yes** — planned as "no", corrected on check | the plan guessed the tools band was off-frame. It is not: `spreadsheet-diff` shows the whole window, tolerance control included, so Match rows landed in it. Recaptured with `make screenshots SHOTS=spreadsheet-diff` (the container — the script drives the in-app menu bar, which macOS replaces with the native one), and the README `alt` updated with it |
| `docs/roadmap.md` | **yes** | items 1 and 2 leave **now**; 3 and 4 move up. Mermaid + terse bullets, no prose |
| `docs/brand/roadmap.svg` | **yes** | the Spreadsheet card's chips count the rows on the card — hand-authored, edited in the same change |
| `docs/*.md` | **no** | no IPC surface (`ipc-security.md`), no crypto (`security.md`), no new standard (`standards.md`). `glossary.md` — checked: "key column" is worth an entry, added |

## Implementation plan

- [x] 1. Branch `improvement/spreadsheet-row-identity`, record the token baseline
- [x] 2. **Red:** header-offset cases in `alignColumns.test.js`; watch them fail
- [x] 3. **Green:** header-row scan in `alignColumns.js`, `headerRowIndex` exported
- [x] 4. **Red:** `matchRowsByKey.test.js`; watch it fail (module absent, then behaviour)
- [x] 5. **Green:** `utils/matchRowsByKey.js`
- [x] 6. `spreadsheetDiff.js` — branch on `opts.keyColumns`, expose `headerRows`
      and `duplicateKeys`; extend `spreadsheetDiff.test.js`
- [x] 7. `useSpreadsheetDiff.js` — per-sheet key columns; extend its test
- [x] 8. `.count` chip → `ui.css`; `ViewOptionsMenu.css` drops its copy
- [x] 9. `RowMatchMenu.vue` + `styles/RowMatchMenu.css` on `usePopover`
- [x] 10. `SpreadsheetDiffViewer.vue` — mount it, add the header-row note
- [x] 11. i18n keys in `en.json`, regenerate `en-XA`; `check:i18n` + `check:rawtext` clean
- [x] 12. Seed pair in `seed-local.mjs`; `make local-seed` opens it by hand
- [x] 13. e2e in `spreadsheet.spec.mjs`
- [x] 14. Docs: `README.md`, `docs/roadmap.md`, `docs/brand/roadmap.svg`, `glossary.md`

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-09 | key values are `String(value).trim()` — no case-folding, no numeric coercion | trimming fixes an invisible defect (a trailing space in an export). Folding case would silently merge `ACC-1` and `acc-1`, which in a ledger are two accounts | case-insensitive keys; `Number()` coercion so `'1001'` matches `1001` — cross-format keying is a separate decision with its own failure mode |
| 2026-08-09 | display order follows the RIGHT file | it is the file the reader has open; a removed row is emitted just before the first surviving left row that followed it, so it keeps its context | sorting by key (normalises away the reader's own order); left order (the "after" file is what is being reviewed) |
| 2026-08-09 | key columns are per sheet, held in the composable | the columns differ per sheet, so one global choice is wrong on the second tab | one workbook-wide setting; persisting to the store — the choice is about a comparison, not about the app |
| 2026-08-09 | duplicate keys pair in occurrence order and are COUNTED, never hidden | roadmap item 6 is "a cap that hides is worse than a cap"; the same holds for an ambiguity | refusing to match on a duplicate; matching many-to-one (that is reconciliation, an explicitly undecided track) |
| 2026-08-09 | the header scan is independent per side | the failure case is a title row added on ONE side; a shared index cannot express it | one index for both |
| 2026-08-09 | Auto keeps today's LCS untouched | changing the default matcher is a behaviour change for every existing diff, with no failing case behind it | auto-detecting a key column |
| 2026-08-09 | **scope added on request:** the hovered row is marked in BOTH grids | asked for mid-build. It belongs to this change: keyed rows no longer sit opposite their own position, so carrying a figure across the divider by eye is exactly what got harder | — |
| 2026-08-09 | the hover mark is an `outline` on the `tr`, plus the gutter face | every row and cell state here is already a `background`, so a veil would REPLACE the ghost's stripes and the changed cell's tint; and a wider border would move the rows the virtualization measures (`--grid-row-h` is one number shared by the CSS and the spacer arithmetic) | a background veil; a 2px border; an inset `box-shadow` (collides with `cell-chg` and `err`, which already use one) |
| 2026-08-09 | 2px outline at `-2px` offset, not 1px | 1px read as "a slightly different border" on beacon and contrast, whose hard `--border` is a contract. Measured on rendered frames, not guessed | 1px |
| 2026-08-09 | `RowMatchMenu` renders its backdrop inline, NOT teleported to body | `.content` carries `isolation: isolate`, so a body-level backdrop at z-index 20 outranks the whole diff subtree and swallowed every click meant for the panel. The backdrop is `position: fixed`, so it covers the window from where it is | `Teleport to="body"` (what `ViewOptionsMenu` does — it lives outside `.content`) |
| 2026-08-09 | two choice-composables split out of `useSpreadsheetDiff` | the function hit its 73-line ratchet. `useToleranceChoice` and `useKeyColumns` are the two decisions in it; the diff itself is what is left | raising the cap |

## Validation

- [x] `/validate` — four passes run; nine comment trims, two untyped boundary
      props, one missing test mirror and one stale screenshot found and fixed in
      this change. `quality-audit.md` closes with **no open findings**
- [x] `npm run check` — **green.** lint · style tokens (109 stylesheets) · theme
      depth (20 themes) · structure · i18n (1224 keys, 1224 used) · raw text
      (0, held at baseline) · 3077 tests passed, 2 skipped · build. Coverage
      **95.34 / 88.47 / 95.75 / 96.33** against floors 93 / 86 / 92 / 95
- [x] e2e on the host, `E2E_HIDDEN=1 E2E_WORKERS=1`: `spreadsheet` (9/9, two of
      them new) plus `csv-grid`, `toolbar-view-menu`, `view-toggles`,
      `virtual-rows`, `diff-zoom`, `locale`, `ui-affordances` — 63 passed
- [x] UI seen running: the grid, the panel and the hover mark captured off a real
      launch on **light, matrix, beacon, contrast, sepia, nyan, volcano**; the
      board SVG rendered offscreen and read back before it was committed
- [x] every Docs-impact "yes" done — `README.md`, `docs/roadmap.md`,
      `docs/brand/roadmap.svg`, `docs/glossary.md`
- [ ] `make local-seed` — **not run.** It writes into the user's real DiffBro
      install (userData: saved diffs, snippets, trusted keys), which is not mine
      to change without being asked. The fixture itself is proven instead: the
      e2e builds the same title-row-then-header, re-sorted shape and drives it
      end to end, and `makeXlsx` already writes the four existing pairs
- [x] token usage measured, header row filled

### Red → green, recorded

| test | failure seen first |
|---|---|
| `alignColumns.test.js` — header below a title row (7 cases) | `expected [ 'Trial balance as at 31 Dec 2024', '', '' ] to deeply equal [ 'Account', 'Debit', 'Credit' ]`, and `headerPairing is not a function` |
| `matchRowsByKey.test.js` (14 cases) | `Failed to resolve import ".../utils/matchRowsByKey"` |
| `useSpreadsheetDiff.test.js` — "starts a new pair of files on Auto" | re-verified by deleting the `watch` and watching it fail alone |
| `alignColumns.test.js` — "gives up rather than scanning an unbounded preamble" | a cap test cannot fail before the cap exists, so it was proven by raising `MAX_HEADER_SCAN` to 20 and watching it fail alone |

Three of the seven header cases **passed** on the first run — positional pairing
happened to give the same answer. They were rewritten to insert a column, so
header pairing and positional pairing disagree and the assertion can tell them
apart. A test that passes before the fix guards nothing.

### Bugs found and fixed

1. **`keyColumnsOf` accepted an out-of-range column.** `c?.left !== null` reads
   `undefined !== null` → true, so `columns[9]` on a 3-column sheet reached
   `picked.map((c) => c.left)` and threw. Caught by the "ignores a key column
   only one side has" test; fixed to `c && c.left !== null && c.right !== null`.
2. **The Match-rows panel could not be clicked.** `.content` carries
   `isolation: isolate`; the body-teleported backdrop at z-index 20 outranked the
   whole subtree, so every checkbox click hit the backdrop and closed the panel.
   Caught by the new e2e, fixed by rendering the backdrop inline.
3. **`e2e/toolbar-view-menu.spec.mjs` selected `.count`,** which the chip lost
   when it moved to `ui.css` as `.btn-count`. Caught by running the affected
   specs rather than only the new ones.

### Token usage

Window `2026-08-09T17:38:10Z` → now, 171 requests.

| category | tokens |
|---|---:|
| input | 342 |
| output | 109,136 |
| cache write | 206,072 |
| cache read | 34,534,086 |
| **total** | **34,849,636** |

Cache read dominates, so the total is tokens *processed*, not a bill. The window
is wall-clock and the session worked on nothing else.

**Outcome:** both "now" items on the Spreadsheet track are done, and the board
moves 3 and 4 up. A re-sorted trial balance now reads as the one figure that
moved instead of a wholesale rewrite, a header found under a title row is named
in the band rather than silently abandoned for positional pairing, and the
hovered row is marked in both grids. Three bugs were found and fixed on the way,
two of them by tests written before the code.
