# Roadmap

<img src="brand/roadmap.svg" width="100%"
     alt="Roadmap board — four tracks. Diagrams: readable at rest, the other diagram types, click a change to pan to it. Spreadsheet · finance: row identity by key columns, header row offset, amounts read as amounts, delta and net variance, reading a big diff, caps that announce themselves. Onboarding: sample comparison, coach marks, what's new on upgrade. Signing: macOS Developer ID, Windows deferred.">

<sup>Board is `docs/brand/roadmap.svg` — hand-authored, edit it alongside the
sections below.</sup>

---

## Spreadsheet

**Built** — formulas captured and normalised to R1C1 (`r1c1.js`), number formats
(`numfmt.js`), materiality tolerance, change register, hidden state + error
cells, columns paired by header, `.csv`/`.tsv` through the same grid.

```mermaid
flowchart TB
  subgraph mainp["main — src/main/xlsx/"]
    direction TB
    z["unzip.js — bomb caps"]
    p["parse.js · styles.js — sharedStrings · workbook<br>rels · number formats · hidden state"]
    sh["sheet.js — values + sparse cell extras<br>r1c1.js · numfmt.js"]
    z --> p
    p --> sh
  end
  sh --> ad["adapters/xlsxAdapter.js<br>adapters/csvAdapter.js — delimited text"]
  subgraph rend["renderer"]
    direction TB
    ad --> ac["utils/alignColumns.js — pair columns by header"]
    ac --> dw["utils/spreadsheetDiff.js — diffWorkbooks<br>utils/sheetCells.js — cell identity"]
    dw --> al["utils/alignRows.js — rows + tolerance"]
    al --> g["SpreadsheetGrid.vue"]
    al --> cr["utils/changeRegister.js --> diff:exportFile"]
  end
```

- Capture is not evaluation: nothing in `src/main/xlsx/` computes a formula, and
  the reader still refuses a DOCTYPE and caps every part it inflates

**Reopened.** The track closed against a _model_ diff. Comparing _data_ — a
trial balance, a GL export, a board pack — hits the gaps below.

```mermaid
flowchart LR
  subgraph now["now"]
    direction TB
    a["1 · row identity<br>key columns · re-sorted rows"]
    b["2 · header row offset"]
  end
  subgraph next["next"]
    direction TB
    c["3 · amounts read as amounts"]
    d["4 · Δ and net variance"]
  end
  subgraph later["later"]
    direction TB
    e["5 · reading a big diff"]
    f["6 · caps that announce themselves"]
  end
  now --> next --> later
```

- **1 · row identity** — `opts.keyColumn` exists (`spreadsheetDiff.js:78`) with
  no UI, takes one column, and rows pair by LCS over row signatures: the same
  export sorted differently reads as 100% changed. Key-based matching,
  composite keys, duplicate-key detection
- **2 · header row offset** — `alignColumns.js:16` reads `rows[0]`. A title row
  above the header fails `usable()` and drops silently to positional pairing,
  which is the failure it was written to prevent
- **3 · amounts read as amounts** — `numfmt.js` renders date, time and percent;
  everything else falls through to the raw float, so a P&L shows `1234567.891`
  and never `(1,234)`. A currency or rounding change is invisible today
- **4 · Δ** — nothing computes the difference. Per cell, net per column, and
  whether both sides still foot — in the grid and in the register
- **5 · reading a big diff** — no changes-only view, no next/prev, no search, no
  "twenty biggest movements". On 40k rows the grid is scroll-and-hope
- **6 · silent caps** — the 400-char formula cap (`sheet.js:11`) makes two long
  formulas sharing a prefix compare EQUAL; `maxMetaCells` (`sheet.js:137`) drops
  formula and format comparison past 100k cells; `csvAdapter` sets `truncated`
  and nothing renders it. A cap that hides is worse than a cap
- **Tolerance** takes a threshold of your own now (`useSpreadsheetDiff.js:7`,
  percentage or raw), but it is still global and still `abs` OR `pct`
  (`alignRows.js:39-40`); materiality is "under €100 AND under 0.5%", per
  column. Date serials are now exempt (`meta.dt` — a percentage of 45870 is
  months), but a bare year in a General-formatted cell still reads as an amount,
  which only per-column thresholds fix

Off the board, unsequenced:

- **structure** — `definedNames` already sit in the parsed `workbook.xml`, and a
  repointed named range rewrites every formula that uses it; hidden COLUMNS go
  unread though rows do not; then merged cells, data validation, conditional
  formatting, comments
- **the deliverable** — a CSV of a workbook diff hands the reader the wrong
  format back (`changeRegister.js --> diff:exportFile`). Wanted, in order of
  value: a highlighted **`.xlsx`** that opens as a workbook with the changed
  cells marked and the register as its own sheet; a **PDF / print** file note —
  title block, totals, the register — that goes into a workpaper unedited; an
  exec summary; a per-change note ("FX revaluation") carried into the export;
  provenance on the register
- **totals that stop agreeing** — the grid has every cell and never checks the
  arithmetic: a sum row that no longer matches its components after the change
  is the single most useful thing a finance reader wants flagged, and it is
  computable from what `spreadsheetDiff.js` already holds
- **statement mode** — match rows by a date+amount key and show only what is
  unmatched, rather than aligning positionally. It is the bank-statement and
  ledger shape, and the same one a household needs for "what is new since last
  month" (`alignRows.js`, `opts.keyColumn`)
- **reconciliation** — many-to-one matching, unmatched on both sides,
  group-by-account rollups. A different engine from row alignment: decide
  whether the track goes there before building toward it
- **compare against the saved copy** — the vault already holds an encrypted
  earlier version of a file; one click to diff what is on disk against it is a
  shorter path than finding the old file (`vaultStore`)
- **order-insensitive text** — the same "identical, differently ordered" problem
  outside structured formats. Specced, semantics undecided:
  `specs/2026-08-02-unordered-text-compare/`
- Still out of scope: pivot tables, charts

---

## Diagrams

**Built** — `.mmd` pairs compare as pictures: both sides parse through mermaid's
own `getData()` (`diagramModel.js`), the graphs diff (`diagramDiff.js`, renames
paired on label), and one union source carrying both revisions renders once
(`diagramUnion.js`) so a single layout means an unchanged node cannot drift.
Focus keeps the changes plus a ring of context and says what it hid
(`diagramFocus.js`). Split view lays the two revisions side by side instead.

```mermaid
flowchart LR
  a[".mmd × 2"] --> m["diagramModel.js<br>mermaid getData()"]
  m --> d["diagramDiff.js<br>added · removed · changed · renamed"]
  d --> f["diagramFocus.js<br>context radius"]
  f --> u["diagramUnion.js<br>one source, both revisions"]
  u --> v["DiagramDiffViewer.vue<br>+ change rail"]
```

- Status is encoded twice — colour AND stroke pattern — and the three tokens are
  held to a contrast floor and a pairwise ΔE floor on all 14 by
  `check-theme-depth.mjs`
- Labels come from the compared files, so the union emitter strips the
  characters that would open a directive or a statement (rule 6)

**Open.**

```mermaid
flowchart LR
  subgraph now["now"]
    r["readable at rest<br>fit-width shrinks a large map"]
  end
  subgraph next["next"]
    s["sequence · gantt · pie<br>each needs its own extractor"]
    c["click a change to pan to it"]
  end
  now --> next
```

- **readable at rest** — mermaid gives its svg no intrinsic width, so a 35-node
  map fits the pane and nothing is legible without zooming. Pan and zoom exist;
  a sensible resting scale does not
- **the other diagram types** — `sequence`, `gantt`, `pie`, `journey`,
  `gitGraph`, `mindmap` and the rest expose a bespoke db (`getActors`,
  `getSections`, `getCommits`) with no shared shape, so each is its own
  extractor. They keep the text diff and the toggle stays hidden
- **the register is read-only** — a row names a change you then hunt for by eye;
  clicking one should pan the diagram to it
- Still out of scope: editing a diagram from the diff view, three-way merge

---

## Onboarding

```mermaid
stateDiagram-v2
  [*] --> launch
  launch --> tour: no stored version
  launch --> app: stored is current
  launch --> whatsNew: stored is older
  tour --> app: finish or skip, persist
  whatsNew --> app: dismiss, persist
  app --> tour: re-run from Help menu
```

- No first-run flag exists in `stores/` or `src/main/`; empty state is inline at
  `App.vue:170`
- Store a **version integer**, not a boolean — carries "what's new" with no
  auto-update
- Undiscoverable today: Quick look-up shortcut · Structure toggle · sealed share
- Order: sample comparison first, coach marks for the three above, carousel only
  as fallback
- Scrim from `--shadow-rgb`, never a hardcoded `rgba()` — seven themes are
  light-ground
- E2E: throwaway `--user-data-dir`, assert shown once

---

## Code signing

```mermaid
flowchart LR
  cert["Apple Developer ID"] --> id["electron-builder.yml:80<br>mac.identity"]
  id --> fuse["re-enable<br>EnableEmbeddedAsarIntegrityValidation"]
  fuse --> ci[".github/workflows/release.yml<br>signing + notarization secrets"]
  ci --> out(["signed · notarized"])
```

- The fuse is off _because_ nothing is signed — `electron-builder.yml` header
  documents the dependency
- Notarization is automated by electron-builder; no app change needed
