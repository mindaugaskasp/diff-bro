# Redesign the Appearance pane

|                                         |                               |
| --------------------------------------- | ----------------------------- |
| **Status**                              | shipped                       |
| **Progress**                            | 6 / 6 steps                   |
| **Branch**                              | `improvement/appearance-pane` |
| **Started**                             | 2026-08-08                    |
| **Finished**                            | 2026-08-08                    |
| **Bugs found and fixed this iteration** | 4 / 4                         |
| **Token baseline**                      | 2026-08-08T17:02:53Z          |
| **Claude tokens used**                  | —                             |

## Problem

Measured off the live pane, not guessed:

- **The theme grid is ragged.** Chips size to their labels — measured widths run
  **85px to 111px** — so fourteen of them wrap **4·4·3·3** with a torn right
  edge and no column to scan down.
- **The Language row is centred** while every heading around it is left-aligned.
  The cause is a cascade fault: `ui.css:546` sets `.dialog label { flex-direction:
column }`, and `.language-row` sets `align-items: center` meaning _vertical_
  centring — but in a column that centres HORIZONTALLY. Its neighbour `.row`
  carries the `flex-direction: row` the language row was never given, and its
  comment even says why.
- **The toggles have no heading**, so three unrelated switches read as part of
  the Language section.
- **"Show tour" floats** right-aligned inside a checkbox row it is not part of.
- **The swatch shows three identical dots** — the accent and the add/remove
  hues, but not a surface, a rule or a line of text, which is what a theme
  actually looks like.

## Solution

Option **C** from the proposal
(https://claude.ai/code/artifact/1e38fe4d-c903-471d-a224-7e56345d77ea):
uniform specimen tiles in a real grid, and the rest of the pane rebuilt as one
left-aligned column.

**The measurement that drives it:** `--border` against `--bg-raised` is
**1.41–1.84:1 on twelve of the fourteen** themes, against a 3:1 non-text floor.
Only `beacon` (15.91) and `contrast` (18.88) can be seen, and those two carry a
hard keyline by contract. So the chip's `1px solid var(--border)` does not draw
the cell on most themes — the grid is ragged BECAUSE nothing bounds it. The tile
fixes that by being its own opaque specimen rather than a bordered box.

| option                      | why not                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Keep chips, add `min-width` | Evens the widths but leaves the invisible keyline and the four alignment faults untouched.                   |
| A dropdown of theme names   | Fourteen themes are chosen by eye; a name-only list is the one control that cannot show what it is offering. |
| Two columns of list rows    | Reads as a settings list, not a picker, and doubles the pane's height.                                       |

## Scope

**In:** the theme grid, the language row, a Behaviour heading, the tour row, and
a theme-sweep surface for the new pane.

**Out:** the other Settings panes; the `THEMES` data itself; adding or removing
any theme; the dialog's own chrome.

## Design

A tile is a fixed-width cell in `repeat(auto-fill, minmax(112px, 1fr))`. Its top
half is a **specimen** on the theme's own ground — an accent bar, a text rule, a
dim rule, and the add/remove pair — so the cell is opaque and draws its own edge
without a keyline. Its bottom half is the label on `--bg-raised`.

Selection is a 2px inset `--accent` ring **plus a bolder label**: `solar`'s
accent is the weakest at 3.52 against the surface, which clears the 3:1 non-text
floor but is not enough to carry selection alone. Never a glow — `matrix`
(#00ff41), `nyan` (#ff2ecb) and `neon` (#22d3ee) halo any accent-tinted shadow.

Tiles group under **Light** and **Dark** subheads (seven each), which is the
question people arrive with. This is what the proposal's rendered C mockup
showed.

The language row becomes a `.row` — the idiom already in this stylesheet for
"label left, control right" — which fixes the centring by using the thing that
already works rather than patching the cascade.

### Theme verdict — all 14

Resolved through their `var()` chains from `themes.css`, against `--bg-raised`.
No new ink: the label is `--text`, the group subhead `--text-dim`, the ring
`--accent`, the specimen the theme's own ground.

| theme    | label/surface | group label | ring  | verdict                       |
| -------- | ------------- | ----------- | ----- | ----------------------------- |
| light    | 18.42         | 7.03        | 5.18  | pass                          |
| dark     | 16.02         | 6.15        | 5.05  | pass                          |
| solar    | 13.34         | 4.36        | 3.52  | pass — weakest ring of the 14 |
| neon     | 17.19         | 6.62        | 10.74 | pass                          |
| nord     | 10.84         | 5.02        | 6.24  | pass                          |
| sepia    | 9.77          | 3.93        | 4.35  | pass                          |
| dim      | 14.01         | 5.52        | 7.79  | pass                          |
| beacon   | 21.00         | 13.08       | 10.47 | pass — keeps its hard keyline |
| meridian | 12.22         | 5.14        | 3.88  | pass                          |
| linen    | 15.35         | 5.16        | 6.38  | pass                          |
| bloom    | 14.58         | 4.92        | 4.95  | pass                          |
| nyan     | 16.34         | 8.08        | 5.92  | pass — flat ring, no glow     |
| matrix   | 17.79         | 7.25        | 14.68 | pass — same                   |
| contrast | 21.00         | 12.63       | 8.54  | pass — keeps its hard keyline |

Floors: 4.5 label, 3 group label and ring. `beacon` and `contrast` keep a
visible tile border at rest (`--border`, 15.91 / 18.88) rather than the
transparent one the other twelve use — removing their keyline is disqualifying.

## Security rules touched

**None.** No IPC, no fs, no crypto, no dependency, no external link. A settings
pane's markup and its stylesheet.

## Test plan

- **e2e** — `e2e/appearance-pane.spec.mjs`: every tile is the same width
  (the raggedness, measured); the theme heading, the group subheads, the
  language label and the Behaviour heading share one left edge (the centring,
  measured); clicking a tile switches the theme and marks exactly one selected.
- **theme sweep** — a `settings-appearance` surface, so the tile label, the
  group subhead and the selected ring are measured on all 14 every run rather
  than in the table above once.
- **red → green** — each watched failing against the current pane.

## Docs impact

| surface                  | needed? | what changes                                                        |
| ------------------------ | ------- | ------------------------------------------------------------------- |
| `README.md`              | no      | the theme list and count are unchanged; this is how they are shown. |
| `docs/screenshots/*.png` | no      | no captured frame shows the Settings dialog.                        |
| `docs/roadmap.md`        | no      | no track covers Settings.                                           |

## Implementation plan

- [x] 1. **Failing e2e first** — widths equal, left edges shared.
- [x] 2. **`SettingsAppearance.vue`** — tiles, groups, `.row` language, Behaviour heading, tour row.
- [x] 3. **CSS** — the tile and its specimen; delete `.language-row`.
- [x] 4. **Catalogue keys** for the new headings.
- [x] 5. **Theme-sweep surface**, run across all 14.
- [x] 6. **Close**: prettier, `npm run check`, host e2e, `/validate`.

## Decisions

| date       | decision                                                             | why                                                                                                                                                                                                                 | rejected                          |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2026-08-08 | The specimen IS the cell; no keyline is relied on                    | `--border` scores 1.41–1.84 on twelve of fourteen, so the chip border never drew the cell to begin with                                                                                                             | evening the chips' widths         |
| 2026-08-08 | Selection is a ring AND a bolder label                               | `solar`'s accent is 3.52 — over the non-text floor, under what colour alone should carry                                                                                                                            | ring only; a glow                 |
| 2026-08-08 | The language row becomes the existing `.row`                         | The centring is `.dialog label { flex-direction: column }` meeting `align-items: center`. `.row` already carries the fix and says so in a comment                                                                   | patching `.language-row`          |
| 2026-08-08 | The pane pads its right edge rather than trusting `scrollbar-gutter` | `stable` is specified to do NOTHING where the platform draws OVERLAY scrollbars (macOS), and an overlay bar takes no layout width — it painted over the rightmost tile. The padding is what holds on every platform | `scrollbar-gutter: stable` alone  |
| 2026-08-08 | The dialog widened 580 → 870px                                       | Asked for during the build; it also buys the grid two more columns, so the fourteen tiles fit in two rows per group                                                                                                 | keeping 580 and letting it scroll |
| 2026-08-08 | Group by ground, as the rendered C mockup showed                     | The proposal's prose split grouping into option B but its C mockup rendered it; the mockup is what was approved. Two labels are cheap to drop                                                                       | a flat grid of 14                 |

## Validation

- [ ] `/validate` — everything found is fixed in this change
- [ ] `npm run check`
- [ ] UI seen running — host e2e + theme sweep
- [ ] Docs-impact "yes" done
- [ ] token usage measured

**Outcome:**
