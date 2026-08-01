# Roadmap

<img src="brand/roadmap.svg" width="100%"
     alt="Roadmap board — four tracks. Spreadsheet: formula capture + R1C1, number formats, materiality tolerance, change register, anomaly flags, column alignment. Onboarding: sample comparison, coach marks, what's new on upgrade. Tabs: right-click menu, close left/right/all, one prompt per batch. Signing: macOS Developer ID, Windows deferred.">

<sup>Board is `docs/brand/roadmap.svg` — hand-authored, edit it alongside the
sections below.</sup>

---

## Spreadsheet

```mermaid
flowchart TB
  subgraph mainp["main — src/main/xlsx/"]
    direction TB
    z["unzip.js — bomb caps"]
    p["parse.js — sharedStrings · workbook · rels<br>2 · styles.xml number formats<br>5 · hidden sheet/row state"]
    sh["sheet.js — cell values<br>1 · capture &lt;f&gt;, length-capped"]
    z --> p
    p --> sh
  end
  sh --> ad["adapters/xlsxAdapter.js"]
  subgraph rend["renderer"]
    direction TB
    ad --> dw["utils/spreadsheetDiff.js — diffWorkbooks<br>1 · formula-vs-value change class<br>5 · error-cell comparison"]
    dw --> al["utils/alignRows.js<br>3 · materiality tolerance<br>6 · column alignment"]
    al --> g["SpreadsheetGrid.vue<br>1 · render formula vs value<br>4 · change register export"]
  end
```

- `sheet.js:51` drops `<f>` — a formula replaced by its own cached value reads
  as **unchanged**
- Capture ≠ evaluation; `docs/ipc-security.md` lines 38 · 87 · 112 need updating
- R1C1 normalisation required, or one row insert flags every formula below it
- `styles.xml` skipped → dates render as serial numbers
- Out of scope: pivot tables, charts, conditional formatting, cell comments

---

## Tab management

```mermaid
flowchart TB
  rc["right-click — DiffTabBar.vue"] --> menu["context menu · new<br>close · others · left · right · all"]
  menu --> many["requestCloseMany · new<br>resolve the survivor set once"]
  hit["× · middle-click · File menu"] --> one["requestClose — tabsStore.js:196"]
  many --> g{"any unsaved?"}
  one --> g
  g -->|no| c["close"]
  g -->|yes| d["TabCloseDialog<br>one prompt for N tabs"]
  d --> c
```

- `requestClose` is the documented single close guard — a batch routes through
  the same gate, never around it
- `diffStore.pendingTabClose` holds **one** id; a batch prompt needs a set
- `close()` *resets* the last tab instead of removing it (`tabsStore.js:213`) —
  a naive loop would reset it repeatedly
- In-renderer menu, not a native Electron one: precedent at `SavedDiffs.vue:144`,
  backdrop dismiss at `MenuBar.vue:86` (rule 3)
- Placement, outside-click and Escape go in a composable, unit-tested; flip the
  popup near a viewport edge
- Any shortcut lands in both the hidden app menu and `MenuBar.vue`

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
  `App.vue:157-167`
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

- The fuse is off *because* nothing is signed — `electron-builder.yml` header
  documents the dependency
- Notarization is automated by electron-builder; no app change needed
