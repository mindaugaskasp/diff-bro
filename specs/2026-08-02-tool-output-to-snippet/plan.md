# Keep what a tool just produced

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 6 / 6 steps |
| **Branch** | `feat/diagrams-snippets-rail` (continues the batch) |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 1 / 1 |
| **Token baseline** | 2026-08-02T14:40:00Z |
| **Claude tokens used** | not measured |

## Problem

A tool produces something worth keeping — a decoded JWT, a formatted payload, a
generated UUID — and the only way out is the clipboard. To keep it you copy,
open a new snippet, paste, name it. Do it twice a day and it is the same four
actions every time.

The store already has the action for this. `snippetStore.startNewSnippetFrom`
(`stores/snippetStore.js:283`) opens the editor prefilled, and its own comment
says it is "for a Tools dialog's *Add to Snippets*" — but **nothing calls it**
except the CLI's `create-snippet`, which passes an empty string. The button its
comment describes was never built.

## Solution

**Save as snippet** in the tool dialog's actions row, beside Close. It closes
the tool and opens the snippet editor with the output filled in, its language
already picked, and the name empty and focused — which is the only thing the
user still has to decide.

The panels do not share an output shape (`ToolBase64` has `result.output`,
`ToolUuid` a `display` computed, `ToolJson` a local `text`), so each panel
*offers* its current output through a small registration composable and the
shared dialog reads it — the same shape `useCaptureRegion` uses to offer a
scroll box to the image export.

| option | why not |
|---|---|
| The button in each of the ten panels | ten copies of one control is precisely the drift the standards call out, and the actions row already exists once |
| Give every panel a uniform `output` prop/emit | a bigger refactor of ten working panels for one button |
| Read the panel's DOM for its output text | the rendered form is not the value — UUID shows a formatted display, JSON a filtered view |
| Save silently without opening the editor | a snippet with no name is not findable, and naming it is the one decision the app cannot make |

## Scope

**In:** the registration composable, one line per panel that has an output worth
keeping, the button in `TextToolDialog`'s actions, and the language each panel
declares for its own output.

**Out:**

- **The launcher's tool panels** (`QuickLookConvert`). Same composable would
  work, but the launcher's job is to answer without raising the app; opening the
  snippet editor from it is a separate decision.
- Tags. The editor opens with none; tagging is a decision, like the name.
- Tools with nothing stable to keep (`regex` is a match view, not a value).

## Design

```
┌ Base64 ─────────────────────────────┐
│  … panel …                          │
├─────────────────────────────────────┤
│            [ Save as snippet ] [ Close ] │
└─────────────────────────────────────┘
```

- The button is a plain `.btn` in the existing `#actions` slot; no new control
  size, no new class.
- It appears only when the panel currently has output — an empty tool offers
  nothing to keep, and a disabled button that is usually disabled is noise.
- The tool dialog closes first, then the editor opens: two stacked dialogs is
  what `expandDiagram` already avoids for the same reason.

### Theme verdict — all 14

No new surface — one more `.btn` in an actions row that already holds one.
Table omitted for that reason.

## Security rules touched

None of the eight. The output never leaves the renderer: it goes to
`startNewSnippetFrom`, and the editor encrypts on save through the existing
vault path. A secret stays a decision the user makes in the editor.

## Test plan

- **unit — `tests/renderer/composables/useToolOutput.test.js`**: a panel's
  offer is visible to the dialog while it is mounted and gone after it unmounts
  (a stale offer would let the NEXT tool save the previous one's output — the
  same class of bug `useCaptureRegion` had).
- **unit — `tests/renderer/stores/snippetStore.test.js`**: `startNewSnippetFrom`
  fills content and language and leaves the name empty. It is the contract the
  button depends on and is currently only exercised through the CLI's empty case.
- **e2e — `e2e/tools.spec.mjs`**: encode something in Base64, press Save as
  snippet, and the editor opens with that text, a blank name, and saves into the
  library.
- **red → green** — each watched failing first.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | one bullet under "The smaller things" |
| `docs/screenshots/*.png` | no | no captured frame shows a tool dialog |
| `docs/roadmap.md` | no | opens no track |

## Implementation plan

- [x] 1. Token baseline.
- [x] 2. `useToolOutput` + its test, red first.
- [x] 3. Panels offer their output (one line each).
- [x] 4. The button in `TextToolDialog`, closing the tool before opening the editor.
- [x] 5. e2e in `tools.spec.mjs`.
- [x] 6. README, `npm run check`, audit.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | One button in the shared actions row, fed by a registration composable | the panels have no common output shape, and ten copies of a control is the repo's recurring failure | a button per panel |
| 2026-08-02 | The name is left empty and focused | it is the one thing the app cannot infer, and an unnamed snippet is unfindable | generating "Base64 output 3" |
| 2026-08-02 | The tool closes before the editor opens | stacked dialogs, which the diagram expander already avoids | opening the editor over the tool |

## Validation

- [x] `npm run check` — `style tokens ok (91 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `126 passed | 1 skipped` files,
      `1859 passed | 2 skipped` tests
- [x] e2e — `e2e/tools.spec.mjs` 4 passed (the two new cases: the output reaches
      the editor with an empty name and saves; the button stays away while the
      tool is empty). Full suite `287 passed, 2 skipped`
- [x] README bullet under "The smaller things"
- [x] `make local-seed` — n/a

**Red → green recorded:** `useToolOutput.test.js` failed to resolve its import →
3 passed. `snippetStore.test.js` gained the `startNewSnippetFrom` contract →
56 passed.

**Bug found and fixed:** the first build shipped a button that never appeared.
The offer was a plain module variable, and a panel registers on ITS mount —
after the dialog around it has already rendered — so nothing told the actions row
to re-render, and no reactive read had been established to fix it later. Making
the offer a `shallowRef` is the whole fix; the e2e caught it, not the unit test,
because the unit test calls `toolOutput()` directly rather than through a render.

**Also fixed:** `e2e/json.spec.mjs:171` still selected the capture button by
`/Image/` — missed in the rename because the grep covered `/^Image/` and quoted
forms but not that one. Found by the full suite.

**Outcome:** shipped as planned. The store action it needed had been sitting
unused since it was written, with a comment describing this button.
