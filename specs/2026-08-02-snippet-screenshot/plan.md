# Screenshot a snippet

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 13 / 13 steps |
| **Branch** | `feat/snippet-screenshot` |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 1 / 1 |
| **Token baseline** | 2026-08-02T10:48:35Z |
| **Claude tokens used** | 25,026,285 (mostly cache read) |

## Problem

A saved diff can be handed to someone as a picture — `diffStore.exportImage`
(`src/renderer/src/stores/diffStore.js:531`) photographs the app's own diff
column, so the shot carries the live theme and Monaco's highlighting. A snippet
cannot.

That gap is sharpest for **Mermaid snippets**. The library already renders them
as real diagrams — the hover card (`SnippetPreviewCard.vue:40`) and the
zoom/pan viewer (`MermaidViewerDialog.vue`) both do — but the only thing that
leaves the app is `copyText` (`SnippetRow.vue:43`), which yields Mermaid
*source*. Pasted into Jira or a chat, source is noise: the reader wanted the
picture, and the person who has it has no way to produce one. For a code
snippet the same button is worth less but still real — the colouring, the name
and the language survive where a paste loses them.

Everything the picture needs already exists and is used by four surfaces:
`useCaptureRegion` (`composables/useCaptureRegion.js:14`), the shutter
(`diffStore._shoot:567`), the scroll-and-stitch loop (`_shootTall:609`) and the
`image:capture` / `image:appendSlice` IPC. The one thing missing is a subject
that is not a diff.

## Solution

A **capture stage**: an opaque layer that claims `.content` for the duration of
one shot, renders the snippet through the app's own components, is photographed
by the existing shutter, and is gone. Two bodies, chosen by language:

| snippet | stage body | ready when |
|---|---|---|
| `mermaid` | `<MermaidDiagram :debounce="0">` — the same component the viewer and the hover card use, themed by `renderMermaid(code, diff.theme)` | its `@rendered` fires |
| anything else | `<SnippetCode>` — `--syn-*` colouring, name and language | its highlighting settles |

Route:

1. `SnippetRow` gains an image button (hidden for a secret snippet).
2. `diffStore.exportSnippetImage(id)` decrypts the body, sets
   `snippetShot = { name, lang, code, ready, failed }`, waits for the stage to
   report itself painted, calls the **unchanged** `_shoot()`, then clears it in
   a `finally` — the same shape as `exportImage`.
3. `SnippetShot.vue` renders inside `.content` as an absolutely-positioned
   stage and registers its scroll box with `useCaptureRegion`.
4. The existing `DiffImageDialog` previews it; `imageEntry` gains `subject`
   (`diff` · `snippet` · `diagram`) so its copy names what was photographed.

Three small generalisations make it fit, each pure and unit-tested:

| change | why |
|---|---|
| `captureTarget.js`: prefer `[data-capture-stage]` over `.content` | the stage is the region, when one is up |
| `captureTarget.js`: `.syn-line, .shot-figure` join `LINE_SELECTOR` | crops a 6-line snippet to 6 lines and a small diagram to the diagram, exactly as it crops a short diff |
| `captureTarget.js`: new `untilTrue(read, {frames})` | `untilChanged` cannot express "already ready"; polls to a budget, mirrors its sibling |
| `useCaptureRegion`: restore the PREVIOUS scroller on unmount | the stage overlays a live `DiffViewer`; setting `null` would leave the diff unphotographable until it remounted |

| option | why not |
|---|---|
| Photograph Mermaid snippets as CODE | what the user actually needs is the diagram — source can be copied by hand and is useless in a ticket |
| Export the SVG itself (`.svg` file / SVG on the clipboard) | Jira, Slack and Confluence want a raster paste; the app's PNG path (copy + Save PNG…) already exists and is what every other export uses |
| Photograph from inside `MermaidViewerDialog` | it carries zoom, pan and a resizable panel — the shot would inherit whatever transform the user left, and the scrim lands in the frame |
| `v-if` the stage into the `.content` router, unmounting `DiffViewer` | Monaco is destroyed and rebuilt for a screenshot of something else — the live comparison loses its scroll position and selection. Also re-indents App.vue's whole template (106 lines, cap 120) |
| Redraw the snippet to a canvas / HTML-to-image | the thing this repo already decided against — a look-alike drifts from the app, and theme + `--syn-*` colouring would have to be re-derived |
| Reuse `SnippetPreviewCard` as the subject | it truncates at 4,000 chars (`useSnippetPreview.js:9`) and is positioned against the pointer |

## Scope

**In:** an image button on every non-secret snippet row; the capture stage with
both bodies; the tall-subject stitch (free — `planSlices` drives it off the
registered scroller, so a flowchart taller than the window comes out whole);
`subject` on `imageEntry` and the dialog copy that reads it; copy/save PNG
through the existing dialog.

**Out:**

- **Secret snippets** — refused at the button AND in the store. Not an omission;
  a photograph of a masked secret is either useless or a leak.
- **A diagram that will not render** — no picture, a notice instead. A framed
  screenshot of Mermaid's error box helps nobody.
- **Export from the Mermaid viewer itself** (with its zoom/pan state), and
  export as `.svg`. Both are their own spec.
- **A light/dark override for the diagram** — SHIPPED first, as
  `specs/2026-08-02-mermaid-diagram-theme/`, which is why this branch is based on
  it. `MermaidDiagram` resolves the mode itself, so the stage inherits it: pin a
  diagram Light and the picture comes out light even from a dark app.
- **A line-range selection**, the diff export's `band`. There is nothing to
  select on the stage.
- **The tooltip-over-the-stage case.** A click dismisses its own tip
  (`pointerdown`), which is the only path this feature ships; the menu path that
  could leave one up is the diff export's, already covered by
  `e2e/diff-image.spec.mjs:410`.
- Quick-look launcher rows — no `.content` in that window, so no stage.

## Design

The stage is `.content`'s own geometry, so a snippet picture is the same width
as a diff export. One head band, one of two bodies:

```
┌ .snippet-shot  position:absolute; inset:0; background: var(--bg); z-index:6 ─┐
│ .shot-head  .band .band-row   bg var(--bg-panel) · border-bottom             │
│   var(--border) · box-shadow var(--shadow-1)                                 │
│   ┌ name (var(--text), --font-md, 600) ────── lang chip (var(--text-dim)) ┐  │
│ .shot-body   overflow:auto — the registered capture region                   │
│                                                                              │
│   mermaid →  .shot-figure  (padding --space-4, shrink-wraps the SVG)         │
│                <MermaidDiagram :debounce="0">                                │
│   else    →  <SnippetCode>  → --syn-keyword / --syn-string / --syn-number /  │
│                --syn-property / --syn-comment                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Nothing new in `tokens.css`; the head is the `.file-slots-row` idiom
  (`App.css:9`) so the picture's header sits at the height the app's own band
  does — `.band` + `.band-row`, never padding.
- The row button is the existing `.row-btn` + `<AppIcon name="image" />`
  (`icons.js:281`, already the saved-diff export's glyph). No new control size.
- **Diagram sizing is the one real piece of CSS.** `MermaidDiagram` centres
  itself in a 100%-height host (`MermaidDiagram.css:1`), which would leave a
  small diagram floating in the middle of a tall frame. The stage overrides that
  to top-aligned and auto-height, so `.shot-figure` shrink-wraps the SVG:
  - the SVG keeps `max-width: 100%` → a wide diagram scales down to the stage
    width, `height: auto` keeps its aspect ratio, and `hiddenColumns` stays 0;
  - `max-height: 100%` stops applying against an auto-height parent → a tall
    diagram renders at natural height, the body scrolls, and the existing
    scroll-and-stitch loop returns it whole rather than cut at the fold;
  - a short diagram (or a short snippet) is cropped just below `.shot-figure`
    by `lastLineBottom` + `BOTTOM_PAD`, with the existing `MIN_HEIGHT` floor.
- `.syn` wraps (`white-space: pre-wrap`), so the code body has no horizontal
  scroll either: the dialog's off-screen-columns warning never fires here.

### Theme verdict — all 14

Values parsed from `styles/themes.css`. The stage reads `--bg` (the reading
plane, which is what Monaco paints in every theme), `--bg-panel` + `--border` +
`--shadow-1` for the head, and `--syn-*` for code — the same five syntax tokens
`SnippetPreviewCard` already ships on all 14, each solved per theme against that
theme's own ground. The diagram's own palette comes from
`mermaidThemeFor(diff.theme)` (`utils/mermaid.js`), which the hover card and the
viewer already exercise on every theme; the stage adds no colour to it.

| theme | ground | verdict | note |
|---|---|---|---|
| light | light `#ffffff` | pass | floating-canvas: `--bg-canvas` is `--bg-panel` `#eeefef`, stage stays `--bg` `#ffffff` — the reading plane, same as Monaco's |
| dark | dark `#0d1117` | pass | head `#161b22` on `#30363d` keyline |
| solar | light `#fffdf6` | pass | head `#fbf2dd`, border `#e7d6ac` |
| neon | dark `#090d18` | pass | accent `#22d3ee` never fills or glows here — it only tints the row glyph on hover |
| nord | dark `#2e3440` | pass | head `#3b4252`, border `#4c566a` |
| sepia | light `#e9dcbe` | pass | head `#dfcea6` — the strongest panel/bg separation of the light set |
| dim | dark `#1b1917` | pass | head `#232019`, border `#3a352b` |
| beacon | dark `#000000` | pass | bg `#000000` vs head `#0b0b0b` is nearly nothing — the `#e0e0e0` hard keyline is what separates them, and it is kept |
| meridian | light `#f5f7f4` | pass | `--shadow-rgb: 20 40 45` tints `--shadow-1` cool; no literal rgba anywhere |
| linen | light `#faf7f0` | pass | `--shadow-rgb: 40 34 20` |
| bloom | light `#f9f4f5` | pass | `--shadow-rgb: 50 30 40` |
| nyan | dark `#160a20` | pass | accent `#ff2ecb` confined to the hover glyph; border `#7a3fa6` |
| matrix | dark `#020a04` | pass | accent `#00ff41` likewise; MatrixRain sits at `z-index:-1` inside `.content` and the opaque stage covers it |
| contrast | light `#ffffff` | pass | `#111111` hard keyline kept on the head — removing it would fail `check:themes` |

Disqualifiers checked and avoided: no hardcoded colour, no accent-tinted glow,
no border removed on `contrast`/`beacon`, no hand-rolled `rgba()` drop.

## Security rules touched

- **Rule 3 (renderer never touches Node/Electron)** — the stage is renderer DOM;
  the shot still goes through `window.api.captureDiffImage` /
  `appendDiffImageSlice`.
- **No new IPC handler, no new main-process write surface** — `image:*` is
  reused verbatim, so `docs/ipc-security.md` is unchanged.
- **Rule 8 (no injection sinks)** — `SnippetCode` renders every run through text
  interpolation, and `MermaidDiagram` adopts a parsed `<svg>` node with
  `replaceChildren`, never `innerHTML`. Mermaid stays at `securityLevel:
  'strict'`; the stage passes it nothing new.
- **Secret snippets** are refused twice: the button is not rendered
  (`isSecret(entry)`), and `exportSnippetImage` returns a notice before it
  decrypts. Vault plaintext reaches the DOM only for a snippet the user could
  already read on screen, and only for the length of one shot — the stage is
  torn down in a `finally`, and the bitmap main holds is dropped by the existing
  `image:forget` when the preview closes.
- No new dependency, no `shell.openExternal` call site, no crypto change.

## Test plan

- **unit — `tests/renderer/utils/captureTarget.test.js`**
  - `untilTrue` resolves on the frame the value turns truthy; resolves `false`
    when the budget runs out; resolves immediately when it is already true (the
    case `untilChanged` gets wrong).
  - `captureRectOf` measures `[data-capture-stage]` when one is present and
    `.content` when it is not.
  - a stage holding `.syn-line`s is cropped just under the last one, and a stage
    holding a `.shot-figure` just under the figure — not to the full column
    height (the "mostly-empty page" failure).
- **unit — `tests/renderer/composables/useCaptureRegion.test.js`** (new): a
  second registration restores the FIRST scroller on unmount, not `null`. Red
  first: today's composable returns `null` and the diff behind the stage would
  be left unphotographable.
- **unit — `tests/renderer/stores/diffStore.test.js`**
  - `exportSnippetImage` stages the snippet, shoots, previews it as
    `{ subject: 'snippet', name }`, and clears `snippetShot` afterwards.
  - a **mermaid** snippet stages as a diagram (`subject: 'diagram'`) and is not
    shot until the stage reports `rendered`.
  - a diagram that fails to render takes no picture: a notice, `imageEntry`
    still null, stage cleared.
  - the code path is not shot until the highlighting settles (drive `ready` from
    a fake rAF, as the Monaco-worker test at :1343 does).
  - a **secret** snippet is refused: no capture call, no decrypt, a notice.
  - a failed capture still clears the stage and lowers `imageCapturing`.
- **e2e — `e2e/snippet-image.spec.mjs`** (new, modelled on `diff-image.spec.mjs`)
  - a **Mermaid** snippet exports a picture of the DIAGRAM: while
    `.content.capturing` is up the stage holds an `<svg>` and no `.syn-line`
    (sampled on an interval, as the tooltip test at `:410` does), and the PNG
    that comes back is real bytes with the dimensions the dialog reports.
  - the picture carries colour (count non-grey pixels off the clipboard bitmap,
    as `diff-image.spec.mjs:207` does) — the assertion that proves the stage
    waited for Mermaid's render / the grammar instead of photographing an empty
    frame.
  - a code snippet exports its colouring, with `alt` naming the snippet.
  - a Mermaid diagram taller than the pane stitches past one screenful.
  - the live comparison is untouched afterwards — same files, same scroll
    position — which is the whole reason for the overlay route.
  - a secret snippet's row has no image button.
- **red → green** — each unit test above is watched failing before its source
  change; recorded in Validation.
- **seed fixtures** — none. No new file format and no changed data shape;
  `scripts/seed-local.mjs` is untouched.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | the "Export as image" feature row (line 55) says the diff view is what gets photographed; it now covers snippets, and Mermaid snippets as rendered diagrams. The "Snippets" row (line 56) lists "live Mermaid" — worth saying it can leave as a picture |
| `docs/screenshots/*.png` | no | the button appears on hover only, and no captured frame (`empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`) shows a hovered snippet row or the stage |
| `docs/roadmap.md` | no | the four tracks are Spreadsheet, Tab management, Onboarding, Code signing — this closes no item and opens no track |
| `docs/brand/roadmap.svg` | no | the board is unchanged, so the hand-authored SVG is too |
| `docs/*.md` | no | no new IPC (`ipc-security.md`), no crypto or trust change (`security.md`), no new term (`glossary`), no new convention (`standards.md`) |

## Implementation plan

- [x] 1. Branch `feat/snippet-screenshot` off `main`, record the token baseline.
- [x] 2. `captureTarget.test.js`: `untilTrue`, the capture-stage preference and
      the `.syn-line` / `.shot-figure` crop — watch all three fail.
- [x] 3. Implement them in `utils/captureTarget.js`; green.
- [x] 4. `useCaptureRegion.test.js` (red) → restore the previous scroller (green).
- [x] 5. `useHighlightedCode` also returns `settled` (true once the grammar has
      landed, or the retry chain is spent), so the shutter has something honest
      to wait on for the code body.
- [x] 6. `SnippetShot.vue` + `styles/SnippetShot.css`: head band, code body,
      diagram body with the shrink-wrap overrides; `@rendered` / `@error`
      wired to the store's `ready` / `failed`.
- [x] 7. Mount it from `App.vue` inside `.content` (one line, no re-indent).
- [x] 8. `diffStore` tests (red) → `snippetShot` state, `exportSnippetImage`
      (code, diagram, render-failure and secret paths), `subject` on
      `imageEntry`, typedef in `types.js` (green).
- [x] 9. `DiffImageDialog` copy reads `subject` — alt text, the size note and
      the truncation note.
- [x] 10. `SnippetRow`: the image button, hidden for a secret snippet.
- [x] 11. `e2e/snippet-image.spec.mjs`; run `make e2e`.
- [x] 12. README rows.
- [x] 13. `npx prettier --write` on touched files, `npm run check`, `/validate`.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | A Mermaid snippet photographs as the RENDERED DIAGRAM | it is the only form worth pasting into a ticket; the source is already one click away on the copy button | photographing the code, which the reader cannot use |
| 2026-08-02 | A diagram that fails to render produces a notice, not a picture | a screenshot of Mermaid's error box is worse than nothing, and the editor is where a broken diagram gets fixed | falling back to a picture of the code |
| 2026-08-02 | The stage OVERLAYS `.content`; `DiffViewer` stays mounted | a screenshot of a snippet must not destroy the user's live editor state | `v-if` in the content router, which rebuilds Monaco and loses scroll + selection |
| 2026-08-02 | `useCaptureRegion` restores the previous scroller instead of clearing it | with the stage overlaying a live viewer, `null` orphans the viewer's registration | a scroller stack — one level is all the overlay needs |
| 2026-08-02 | The stage top-aligns and auto-heights `MermaidDiagram` | its centred, 100%-height host would frame a small diagram in whitespace and clamp a tall one to the pane; auto height also hands the tall case to the existing stitch loop | capturing the host box as-is |
| 2026-08-02 | Wait on a `ready` signal (`@rendered`, or the highlighter settling), not on a frame count | Mermaid renders asynchronously behind a ~2.8 MB dynamic import, and `useHighlightedCode` retries a cold grammar for up to 720 ms (`RETRY_MS`); counting frames is exactly how the diff export once photographed an unhighlighted pane | a fixed sleep |
| 2026-08-02 | Branched off `feat/mermaid-diagram-theme`, not `main` | direct overlap: the diagram stage is only worth photographing once a diagram can be pinned light, and the e2e asserts exactly that — it cannot run without that branch's unmerged work | branching off main and re-testing after the merge |
| 2026-08-02 | Dialog copy stays in `DiffImageDialog` as a computed off `subject` | it is presentation, `.vue` is outside the coverage set, and the e2e asserts the rendered alt text | a `utils/imageSubject.js` for six strings |

## Validation

- [x] `npm run check` — `style tokens ok (91 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `115 passed | 1 skipped` files,
      `1699 passed | 2 skipped` tests. Coverage 95 / 87.97 / 93.89 / 96.16 vs
      floors 93 / 86 / 92 / 95
- [x] e2e — `e2e/snippet-image.spec.mjs` 6 passed; FULL suite `269 passed,
      2 skipped` (5.9 m)
- [x] UI seen running: the real exported PNGs were saved out of the container
      and read back — a diagram pinned Light shot from the dark theme (white
      sheet, dark header band, MERMAID chip), the same diagram on Auto
      (full-bleed dark), and a JSON snippet with live `--syn-*` colouring
      cropped to its last line
- [x] README "Export as image" row updated
- [x] `make local-seed` — n/a, no format or data-shape change
- [x] token usage measured

**Red → green recorded:** `captureTarget.test.js` 6 failures (stage preference,
both crops, `untilTrue` missing) → 42 passed. `useCaptureRegion.test.js` failed
on `expected null to be { viewportEl }` — the exact orphaned-scroller bug — →
3 passed. `diffStore.test.js` 6 failures (`exportSnippetImage is not a
function`) → 6 passed.

**Bug found and fixed:** this branch is based off `main`, which does NOT carry
`a434c69`'s cold-grammar retry in `useHighlightedCode`. Without it the first
tokenize of a language nobody had hovered yet comes back untyped, so the
screenshot of, say, a YAML snippet would have shipped as plain grey text — the
"photographed before it painted" failure this repo has already paid for once.
The retry chain came with the `settled` signal (step 5), which is what the
shutter waits on.

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since 2026-08-02T10:48:35Z
```

Measured over 74 requests, 2026-08-02T10:48:45Z → 11:08:56Z — this feature only.

| category | tokens |
|---|---:|
| input | 139 |
| output | 43,727 |
| cache write | 87,080 |
| cache read | 24,895,339 |
| **total** | **25,026,285** |

**Outcome:** shipped as planned, with the diagram body as the headline. Two
things the plan did not foresee: the cold-grammar retry above, and that the
`.claude/skills` + `specs/` tooling lives on the unmerged
`feat/spreadsheet-rendering-csv-grid` branch rather than on `main`, so
`token-usage.mjs` had to be read out of that branch to run at all. The overlay
route paid for itself — `e2e/snippet-image.spec.mjs` pins the live comparison's
scroll position across a shot, which the `v-if` route could not have passed.
