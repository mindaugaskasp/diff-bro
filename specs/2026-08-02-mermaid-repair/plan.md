# Repair pasted Mermaid

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 8 / 8 steps |
| **Branch** | `feat/diagrams-snippets-rail` (one commit per spec; planned as `feat/mermaid-repair`) |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-08-02T11:11:43Z |
| **Claude tokens used** | 10,062,977 (mostly cache read) |

## Problem

Mermaid pasted out of Confluence, Word, Slack or a chat window often will not
parse, and the app's only answer is Mermaid's own error string — which names a
token, not the invisible character that produced it. The usual culprits are all
invisible or near-invisible in a code editor:

- Word/Confluence autocorrect turns `-->` into `—>` (em dash) or `–>` (en dash),
  and `->` into `→`. The diagram is now a syntax error whose cause is one
  glyph wide.
- Rich-text copy brings non-breaking spaces (U+00A0) and narrow/figure spaces
  where Mermaid expects an ordinary space.
- Smart quotes (`“ ”`, `‘ ’`) replace the straight quotes a quoted label needs.
- A copied fenced block keeps its ```` ```mermaid ```` wrapper. Rendering already
  peels it (`stripMermaidFence`), but the STORED snippet keeps it, so the source
  a reader copies back out is still fenced.
- Zero-width characters and a BOM ride along invisibly; CRLF arrives from
  Windows tooling.

Every one is mechanical to detect and mechanical to fix. Nothing in the app does.

## Solution

A pure `repairMermaid(text)` in `utils/mermaid.js`, wired into the **Format
button the snippet editor already has** — `FORMATTERS = { json, xml, sql }` in
`composables/useSnippetDraft.js:9` — by adding a `mermaid` entry. `canFormat`
lights the existing button, `formatContent` applies it, and there is no new
control anywhere.

| option | why not |
|---|---|
| A new "Fix" button beside Format | two buttons for one idea, and the standards' recurring failure here is a second bespoke copy of a control that already exists |
| Repair silently on paste / on save | it rewrites the user's text without being asked, and a diagram that was deliberately odd cannot be recovered |
| Repair inside the renderer (`stripMermaidFence`-style, at render time) | the picture would render while the stored source stayed broken — the thing they will paste elsewhere is the source |
| Ship a "did you mean" hint on the error card | `MermaidDiagram` is shared by the hover card, the viewer and the screenshot stage; none of them may mutate content |

## Scope

**In:** the repair itself (arrows, spaces, quotes, fence, zero-width, BOM, CRLF,
trailing whitespace, leading/trailing blank lines); the `FORMATTERS` entry; the
button's tooltip copy; a notice saying whether anything changed.

**Out:**

- **Fixing Mermaid GRAMMAR.** This repairs transport damage — characters a
  copy/paste changed. A diagram that was never valid stays invalid, and says so.
- **Automatic repair** on paste, import or save. It is a button.
- Other languages. JSON/XML/SQL keep their existing formatters.

## Design

No new UI. The existing `SnippetEditorActions` Format button is enabled for a
Mermaid snippet, and its disabled tooltip stops claiming "JSON, XML, or SQL".
For Mermaid it reads `Repair a pasted diagram (arrows, quotes, spaces)`.

Because the repair can be a no-op, the button says what it did — the one case
where silence would read as "the button is broken":

- changed → `Repaired the diagram source.`
- unchanged → `Nothing to repair.`

### Theme verdict — all 14

No visual surface: no new element, no new token, no CSS. The button is
`.btn.btn-sm.btn-ghost`, already shipped and swept on all 14. Table omitted for
that reason, not skipped.

## Security rules touched

None of the eight. A pure string transform in `utils/`, no IPC, no fs, no
crypto, no dependency, no external link, no injection sink — the result is
stored through the same `snippets.update` path the editor already uses, and
rendered through the same interpolation.

## Test plan

- **unit — `tests/renderer/utils/mermaid.test.js`**: one case per damage class
  (em/en-dash and `→` arrows, NBSP and narrow spaces, smart quotes, wrapping
  fence, BOM/zero-width, CRLF, trailing whitespace); a clean diagram is returned
  byte-identical; the repair is idempotent; an em dash INSIDE a label survives
  (only arrow-shaped runs are touched) — the one that decides whether this is
  safe to run on someone's text.
- **unit — `tests/renderer/composables/useSnippetDraft.test.js`**: `canFormat`
  is true for a Mermaid draft; `formatContent` rewrites the content and reports
  changed vs unchanged.
- **e2e — `e2e/mermaid-repair.spec.mjs`**: paste a diagram broken exactly as
  Word breaks it, watch the preview show an error, press Format, watch the
  diagram render. Only a real launch has Mermaid's parser.
- **red → green** — each watched failing first.
- **seed fixtures** — none.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | one bullet in "The smaller things", where the other small affordances live |
| `docs/screenshots/*.png` | no | no captured frame shows the snippet editor |
| `docs/roadmap.md` | no | closes no tracked item |
| `docs/brand/roadmap.svg` | no | board unchanged |
| `docs/*.md` | no | no IPC, crypto, term or convention change |

## Implementation plan

- [x] 1. Branch `feat/mermaid-repair`, record the token baseline.
- [x] 2. `mermaid.test.js` cases for `repairMermaid` — watch them fail.
- [x] 3. Implement `repairMermaid` in `utils/mermaid.js`; green.
- [x] 4. `useSnippetDraft.test.js` (red) → `FORMATTERS.mermaid` + the
      changed/unchanged notice (green).
- [x] 5. `SnippetEditorActions` tooltip copy.
- [x] 6. `e2e/mermaid-repair.spec.mjs`; run it in the container.
- [x] 7. README bullet.
- [x] 8. `npx prettier --write` on touched files, `npm run check`, audit.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | Reuse the editor's Format button | the affordance exists, is already in the right place, and already means "make this text right" | a second button next to it |
| 2026-08-02 | Only arrow-SHAPED dash runs are rewritten | an em dash in a node label is legitimate text; `—>` never is | replacing every em dash, which would corrupt labels |
| 2026-08-02 | The button reports no-op | its effect is often invisible, and silence on a clean diagram reads as a broken button | staying silent |

## Validation

- [x] `npm run check` — `style tokens ok (91 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `115 passed | 1 skipped` files,
      `1710 passed | 2 skipped` tests, coverage floors held
- [x] e2e — `e2e/mermaid-repair.spec.mjs` 2 passed; FULL suite `271 passed,
      2 skipped` (6.1 m)
- [x] UI seen running — the e2e IS the visual check here: it watches the preview
      go from Mermaid's error card to a rendered `<svg>` on one click
- [x] README bullet added under "The smaller things"
- [x] `make local-seed` — n/a, no format change
- [x] token usage measured

**Red → green recorded:** `mermaid.test.js` 8 failures (`repairMermaid is not a
function`) → 23 passed. `useSnippetDraft.test.js` 3 failures (`canFormat` false
for Mermaid; content unchanged; no notice) → 10 passed.

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since 2026-08-02T11:11:43Z
```

| category | tokens |
|---|---:|
| input | 45 |
| output | 17,097 |
| cache write | 34,881 |
| cache read | 10,010,954 |
| **total** | **10,062,977** |

**Outcome:** shipped, smaller than planned because the affordance already
existed — `FORMATTERS` took one entry and the button took a label. Two things
changed during the build: the button renames itself to **Repair** for Mermaid
(the user's ask was a discoverable fix button, and "Format" does not describe
what it does to a diagram), and every damage character in both the source and
the tests is written as a `\u` escape — a regex of literal invisible characters
is exactly the kind of thing a later edit silently breaks.
