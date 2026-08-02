# Mermaid visual diff — compare diagrams as pictures

|                                         |                            |
| --------------------------------------- | -------------------------- |
| **Status**                              | draft                      |
| **Progress**                            | 0 / 16 steps               |
| **Branch**                              | `feat/mermaid-visual-diff` |
| **Started**                             | 2026-08-02                 |
| **Finished**                            | —                          |
| **Bugs found and fixed this iteration** | 0 / 0                      |
| **Token baseline**                      | —                          |
| **Claude tokens used**                  | not measured               |

**Design proposal:** <https://claude.ai/code/artifact/d4e05948-9880-4c66-9fa2-c47ad47823af>
— interactive mockup in the real app chrome, switchable across all 14 themes,
carrying the union view, the at-scale focus view, and the measured contrast
audit this plan's theme table summarises.

## Problem

Two Mermaid files compare as text and nothing else. `resolveAdapter` matches
`textAdapter` last and it matches everything (`adapters/index.js:13`), so a
`.mmd` pair routes to Monaco via `comparableKind === 'text'`
(`diffStore.js:411`, `App.vue:152`). The reader gets line noise for the things a
diagram exists to express:

- an inserted stage re-indents every following line, so a one-node change reads
  as a rewrite
- a re-pointed edge (`B -- no --> D` becoming `B -- no --> E`) is a one-character
  diff that changes the topology
- a node renamed at its id (`A[Start]` → `Begin[Start]`) is two unrelated lines

The app already renders Mermaid — `MermaidDiagram.vue`, `composables/useMermaid.js`
— but only for **snippets**. `looksLikeMermaid()` exists in `utils/mermaid.js:98`
and is wired to exactly one caller, `detectLanguage.js:220`, to pick a snippet's
language. Nothing in the comparison path knows a diagram when it sees one.

Feasibility is settled, not assumed. Probing the pinned `mermaid@11.16.0`:

- `mermaid.mermaidAPI.getDiagramFromText(src)` → `db.getData()` returns
  `{ nodes, edges, other, config }` — the publicly exported `LayoutData` type —
  with `{id, domId, label, shape, isGroup, parentId}` per node and
  `{id, start, end, label}` per edge
- the shape is **uniform** across `flowchart-v2`, `stateDiagram`, `class` and `er`
- it runs **in jsdom with no rendering**, so the whole model-and-diff layer is a
  pure `utils/` unit under the coverage floors
- a union source using `:::status` with **no `classDef`** puts the class on the
  element with zero inline style, leaving colour to our own token-driven CSS

## Solution

A third view beside Split view and Structure. Both sides parse to a normalised
graph, the graphs diff, and the result emits **one** Mermaid source containing
both revisions — rendered once, so there is a single layout and nothing drifts.
Status rides on colour, stroke pattern and a badge glyph.

| option                                                 | why not                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pixel-diff two rendered SVGs                           | Any layout shift reddens the whole image. Measured: inserting one node moved a downstream node from `y=198` to `y=288` while its siblings held.                                                                                                             |
| Render each side, highlight in place                   | Two independent dagre layouts drift — in the mockup the unchanged `Release` lands 168px apart. Kept as a **secondary** view (the SVG carries `id="<svgId>-<domId>"` on nodes and `data-id` on edges, so targeting is a `querySelector`), never the default. |
| `classDef added fill:#dcfce7` for status colour        | Compiles to inline `style="fill:#dcfce7 !important"` on the shape — hardcoded hex no theme can re-tint. Fails the 14-theme rule outright.                                                                                                                   |
| `--accent` for _changed_ (what `.sd-row.changed` uses) | On `matrix`, `--accent` and `--success-text` are both `#00ff41` — OKLab ΔE **0.000**, added and changed are one colour. Also collides with `--danger-border` on light/sepia/bloom (ΔE 0.05–0.08).                                                           |
| Hand-write a Mermaid parser                            | Duplicates the grammar and drifts on every Mermaid release.                                                                                                                                                                                                 |
| Feed modified `LayoutData` straight to the renderer    | No public entry point; `internalHelpers` is marked deprecated in Mermaid's own typings.                                                                                                                                                                     |

## Scope

**In:** `flowchart` / `stateDiagram` / `classDiagram` / `erDiagram` — the four
sharing `getData()`. Union view (default) and side-by-side (secondary). Focus
mode with a context radius and collapsed untouched subgraphs. A change register.
The toolbar toggle. Rename detection (removed↔added matched on identical label).
Three status tokens plus the `check-theme-depth.mjs` ratchet.

**Out:** `sequence`, `gantt`, `pie`, `journey`, `timeline`, `gitGraph`,
`mindmap`, `C4`, `sankey`, `quadrant`, `xychart`, `block`, `architecture`,
`radar`, `packet`, `kanban` — each exposes a bespoke model (`getActors`/
`getMessages`, `getSections`, `getCommits`) with no shared shape, so each is its
own extractor. They keep the text diff and the toggle stays hidden. Editing a
diagram from the diff view. Three-way merge.

## Design

Token-driven; no literal colour, font-size or radius. The viewer card is the
`StructureDiffViewer` idiom — `--bg-raised`, `1px solid var(--border)`,
`--radius-lg` — with a `.band`/`--band-row` legend above and status band below,
`<AppIcon>` throughout, `.btn`/`.btn-sm` for controls.

Three new roles in `tokens.css`:

```css
--dg-add: var(--success-text);
/* nord's #a54c55 scores 1.80:1 on its own panel — under the 3:1 non-text floor.
   Halfway-to-text is the same trick --btn-edge already uses. */
--dg-del: color-mix(in srgb, var(--danger-border) 70%, var(--text));
/* NOT --accent: on matrix --accent === --success-text (#00ff41). --warning-border
   is amber, nobody else's hue here, and .sd-status .chg already speaks it. */
--dg-chg: var(--warning-border);
```

Status is encoded twice so it survives greyscale and colour-blind readers:
added = solid 2px + `+`; removed = **dashed** 2px + `−`; changed = solid on
`--bg-elevated` + `±` and a `was: …` sub-label; unchanged = 1px `--border`
hairline. Node labels stay `--text`, which the depth guard already holds.

**Untrusted input:** the union source is _generated from the compared files_, so
a node label is attacker-controlled text being written back into Mermaid syntax.
Labels are quoted and `"` escaped to `#quot;`; a label can never open a
directive, a `classDef`, or a new statement. This is rule 6 territory and gets
its own negative test.

### Theme verdict — all 14

Values parsed from `styles/themes.css`. `ground` is `--bg`; the **measured**
ground is `--bg-raised` (the card), which is `--bg-panel` on thirteen themes and
`--bg` on `light` alone via the floating-canvas inversion. Ratios are stroke
against that card ground (floor 3:1); ΔE is OKLab distance between statuses
(floor 0.10).

| theme    | ground | verdict       | note                                                                                                                    |
| -------- | ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| light    | light  | pass          | floating-canvas inversion; add 5.08 · del 8.30 · chg 3.14                                                               |
| dark     | dark   | pass          | 6.81 · 5.37 · 3.55                                                                                                      |
| solar    | light  | pass          | tightest grounds — 3.09 · 6.68 · 3.08                                                                                   |
| neon     | dark   | pass          | accent `#22d3ee` unused; no glow. 10.16 · 6.47 · 7.45                                                                   |
| nord     | dark   | **two fixes** | `--danger-border` was 1.80:1 → 3.05 via the mix; sage/gold were ΔE 0.081 → `--dg-chg: #e09a6b`. 4.94 · 3.05 · 4.31      |
| sepia    | light  | pass          | added~changed exactly at the 0.10 floor. 3.61 · 5.76 · 3.13                                                             |
| dim      | dark   | pass          | 8.84 · 5.40 · 4.48                                                                                                      |
| beacon   | dark   | pass          | hard keyline `#e0e0e0` on `#000000` kept. 11.39 · 6.58 · 6.42                                                           |
| meridian | light  | pass          | 4.75 · 8.13 · 3.28                                                                                                      |
| linen    | light  | pass          | 5.19 · 8.45 · 3.51                                                                                                      |
| bloom    | light  | pass          | 4.19 · 7.57 · 3.42                                                                                                      |
| nyan     | dark   | pass          | accent `#ff2ecb` unused; no halo. 13.36 · 5.87 · 7.76                                                                   |
| matrix   | dark   | **fixed**     | accent `#00ff41` === `--success-text`; was ΔE 0.000 on `--accent`, now 0.268 on `--warning-border`. 13.92 · 6.12 · 8.38 |
| contrast | light  | **one fix**   | hard keyline `#111111` kept; `#b38f00` was 2.74:1 → `--dg-chg: #8a6d00` at 4.40. 5.57 · 11.54 · 4.40                    |

All 14 clear both floors after the two per-theme `--dg-chg` overrides.

## Security rules touched

1. **Offline (rule 1)** — no new dependency. `mermaid` is already a production
   dependency and already loads lazily from the bundle
   (`useMermaid.js`); nothing fetches.
2. **Renderer/main split (rule 3)** — entirely renderer-side. No IPC handler, no
   `fs`, no `dialog`. The files are already in memory as `left.content` /
   `right.content`.
3. **Untrusted input (rule 6)** — the union source is machine-generated from the
   compared files. Labels are quoted and escaped so a crafted label cannot inject
   Mermaid syntax; parse failure on either side is caught and shown, never
   thrown into the render loop. Negative test required.
4. **No injection sinks (rule 8)** — the SVG is adopted with
   `DOMParser` + `document.importNode` + `replaceChildren`, exactly as
   `MermaidDiagram.vue:48-53` already does. No `innerHTML`, no `v-html`.
   `securityLevel: 'strict'` and `suppressErrorRendering` stay as they are.

Rules 2, 4, 5, 7 are untouched: no new package, no key material, no sealing or
vault path, no `shell.openExternal` call site.

## Test plan

Written before the code. The model/diff/union layer is pure and runs in jsdom,
so the risky part is unit-testable before any UI exists.

- **unit** — `tests/renderer/utils/diagramModel.test.js`: `getData()` normalises
  to `{nodes, edges, groups}` for all four supported types; `isGroup`/`parentId`
  captured; an unsupported type returns `null`; a parse error returns an error
  rather than throwing.
- **unit** — `tests/renderer/utils/diagramDiff.test.js`: added / removed /
  changed / unchanged for nodes and edges; a label change is `changed`, an id
  change is `removed`+`added` **until** rename detection pairs them; subgraph
  re-parent detected; empty vs populated; identical sides produce zero changes.
- **unit** — `tests/renderer/utils/diagramUnion.test.js`: emitted source parses
  back through Mermaid; `:::status` classes land on the right ids; **no
  `classDef` is emitted** (the inline-`!important` trap); a label containing
  `"`, `-->`, `classDef` or a `%%{init}%%` directive is escaped and cannot alter
  the graph — the rule 6 negative test.
- **unit** — `tests/renderer/utils/diagramFocus.test.js`: context radius 0/1/2
  selects the right node set; an untouched group collapses; a group with one
  change does not; the hidden count is exact.
- **unit** — `tests/renderer/stores/diffStore.test.js`: `canCompareDiagram` true
  only when both sides look like Mermaid and neither is streamed;
  `comparableKind` returns `'diagram'` only with `semanticView` on.
- **e2e** — `e2e/diagram-diff.spec.mjs`: open the seeded `.mmd` pair, the
  Diagram toggle appears, turning it on renders one SVG with the expected
  added/removed/changed classes present, the status band counts match, and
  toggling off returns to Monaco.
- **red → green** — no bug is being fixed here, so there is no pre-existing
  failure to reproduce. Every test above is written and watched failing against
  the unimplemented module before the module exists; record each first failure.
- **seed fixtures** — **required.** `scripts/lib/seedLocal.mjs` has a Mermaid
  _snippet_ (`language: 'mermaid'`, line 124) and **no `.mmd` file pair** — so
  today nobody can open this feature by hand on the host Mac. Add a
  `pipeline-v1.mmd` / `pipeline-v2.mmd` pair through `pair()` alongside the
  existing `service-before.yaml` entry, keep the `seed` tag, and confirm
  `local-seed-clean` removes exactly what it wrote.

## Docs impact

| surface                  | needed?                 | what changes                                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | **yes**                 | Mermaid appears only as a snippet feature today (lines 55–56, 72). The feature table gains the diagram comparison row, and `SupportedFormats.vue` gains a Mermaid entry so the empty state offers it.                                                               |
| `docs/screenshots/*.png` | **yes**                 | One **new** frame (`diagram-diff.png`) with its README `alt`. The existing five are unaffected: the toggle is conditional on both sides being Mermaid, exactly as Structure is, so `diff-light`/`diff-dark` render identically.                                     |
| `docs/roadmap.md`        | **yes**                 | A new **Diagrams** track — mermaid block plus terse Done./Open. bullets, no prose. Sequence and the chart types are the Open. half.                                                                                                                                 |
| `docs/brand/roadmap.svg` | **yes**                 | Same move, hand-authored. **Coordinate first:** the working tree already has uncommitted roadmap edits (the Tabs track was removed from `roadmap.md`), so the track count and lane colours must be reconciled with that change rather than against `main`.          |
| `docs/*.md`              | **yes** (glossary only) | `glossary.md` gains _union view_, _context radius_, _change register_. `security.md` / `ipc-security.md` unchanged — no IPC, no crypto, no new external surface. `standards.md` unchanged — this introduces no new convention, it follows the Structure-toggle one. |

## Implementation plan

- [ ] 1. `utils/diagramModel.js` — `modelFrom(text)` wrapping
      `getDiagramFromText` + `getData()` into `{type, nodes, edges, groups}`;
      returns `null` for unsupported types, `{error}` on parse failure. Tests first.
- [ ] 2. `utils/diagramDiff.js` — `diffDiagrams(a, b)` → per-node and per-edge
      `added|removed|changed|same`, keyed on **semantic id, never `domId`**
      (`domId`'s counter is not stable across parses: `classId-Animal-0` on parse
      vs `classId-Animal-2` on render). Tests first.
- [ ] 3. Rename detection — pair a removed with an added node on identical label,
      report as `renamed`. Tests first.
- [ ] 4. `utils/diagramUnion.js` — emit the union source with `:::status` and no
      `classDef`; quote and escape labels. Tests first, including the injection
      negative test.
- [ ] 5. `utils/diagramFocus.js` — context radius and group collapse over the
      diff result. Tests first.
- [ ] 6. `tokens.css` — `--dg-add` / `--dg-del` / `--dg-chg`; `themes.css` — the
      `nord` and `contrast` `--dg-chg` overrides, each with its one-line why.
- [ ] 7. `scripts/check-theme-depth.mjs` — add the three roles as a fourth
      ratchet (3:1 vs `--bg-raised`, ΔE 0.10 pairwise) so a future theme cannot
      silently reintroduce the matrix collision.
- [ ] 8. `diffStore.js` — `canCompareDiagram` getter beside `canCompareStructure`
      (`:389`); `comparableKind` gains `'diagram'` (`:411`); `structureLabel`
      returns `Diagram`. Tests first.
- [ ] 9. `AppToolbar.vue` — no new control; the existing conditional checkbox
      (`:83`) already renders from `canCompareStructure` + `structureLabel`.
      Widen its condition only.
- [ ] 10. `DiagramDiffViewer.vue` + `styles/DiagramDiffViewer.css` — legend band,
      canvas, status band. ≤250 lines; split the register into
      `DiagramChangeRegister.vue` rather than raising the cap.
- [ ] 11. Wire `App.vue:156` — one more branch in the content router.
- [ ] 12. Reuse `composables/useZoomPan.js` for pan/zoom; register-row click pans
      to the node. Event logic goes in a composable, not inline in the SFC.
- [ ] 13. Seed a `.mmd` pair in `scripts/lib/seedLocal.mjs`; verify
      `make local-seed` opens it on the host and `local-seed-clean` reverses it.
- [ ] 14. `e2e/diagram-diff.spec.mjs`; run via `make e2e` (inside the up
      container — it needs Xvfb).
- [ ] 15. Docs: README row + `SupportedFormats.vue` entry, roadmap Diagrams
      track, `roadmap.svg` reconciled with the uncommitted track change,
      glossary terms.
- [ ] 16. `make screenshots SHOTS="diagram-diff"` in the container; check the
      frame is correctly seeded before committing it.

## Decisions

| date       | decision                                                       | why                                                                                                                                                                                             | rejected                                                                                                                   |
| ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-02 | Union diagram is the default view                              | One dagre layout means unchanged nodes cannot drift; measured drift is 90px for one inserted node and 168px between panes in the mockup                                                         | Side-by-side as default                                                                                                    |
| 2026-08-02 | Side-by-side kept as a secondary view                          | The SVG already carries `id`/`data-id` hooks, so it is cheap, and it is the honest fallback for types with no union emitter                                                                     | Dropping it entirely                                                                                                       |
| 2026-08-02 | _changed_ is `--warning-border`, not `--accent`                | `--accent` === `--success-text` on matrix (ΔE 0.000) and collides with `--danger-border` on light/sepia/bloom; `.sd-status .chg` already colours changed amber, so this agrees with existing UI | `--accent`; a global mix toward `--text` (clears contrast but desaturates amber, collapsing separation on sepia/dim/linen) |
| 2026-08-02 | Two per-theme `--dg-chg` overrides rather than one global rule | Targeted overrides keep the other twelve on the shared token; the global mix broke three themes to fix two                                                                                      | One global `color-mix`                                                                                                     |
| 2026-08-02 | Four graph types in, the rest out                              | They share `getData()`; everything else needs a bespoke extractor and would triple the surface for the first cut                                                                                | Shipping sequence diagrams too                                                                                             |
| 2026-08-02 | Diff keyed on semantic id, never `domId`                       | `domId`'s counter advances per parse, so the same node gets a different `domId` between the model call and the render call                                                                      | Keying on `domId`                                                                                                          |
| 2026-08-02 | Rename detection included in v1                                | Reporting a rename as an unrelated remove+add is actively misleading, and the pass is one function with one test                                                                                | Deferring it                                                                                                               |
| 2026-08-02 | Reuse the Structure toggle rather than adding a control        | `structureLabel` already renames itself per format; a second checkbox would be the repo's recurring "second bespoke copy" failure                                                               | A dedicated Diagram button                                                                                                 |

## Validation

Recorded as fact, not intention.

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] UI seen running (Docker / `make e2e`)
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `make local-seed` opens the `.mmd` pair on the host; `local-seed-clean`
      removes it
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category    | tokens |
| ----------- | -----: |
| input       |        |
| output      |        |
| cache write |        |
| cache read  |        |
| **total**   |        |

**Outcome:**
