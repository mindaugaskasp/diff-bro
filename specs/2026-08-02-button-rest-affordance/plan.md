# A resting button must look like a button

|                                         |                                      |
| --------------------------------------- | ------------------------------------ |
| **Status**                              | shipped                              |
| **Progress**                            | 11 / 11 steps                        |
| **Branch**                              | `improvement/button-rest-affordance` |
| **Started**                             | 2026-08-02                           |
| **Finished**                            | 2026-08-02                           |
| **Bugs found and fixed this iteration** | 3 / 3                                |
| **Token baseline**                      | 2026-08-02T16:05:23Z                 |
| **Claude tokens used**                  | 50,795,129                           |

## Problem

Every document action in the diff toolbar reads as disabled until it is hovered.
`AppToolbar.vue:92-140` gives Paste text / Share / Copy diff / Capture / Clear
the `.btn-ghost` variant, which `ui.css:88-92` defines as no fill and
`--text-dim` ink. Those are two of the three properties `.btn:disabled`
(`ui.css:57-60`) uses to say "unavailable", and the third — no elevation — is
shared too. Save is the only control in the bar that looks pressable.

Measured against all 14 palettes, the resting state carries:

- **fill** — `background: none`, so the surface contrast against the toolbar is
  exactly `1.00` on every theme
- **ink** — `--text-dim`, weakest 3.44 (sepia)
- **elevation** — none, on the seven light grounds where a `--shadow-1` drop
  would read at 12.5–18.9

Enabled and disabled therefore differ by one alpha step on one axis. Two further
defects fall out of the same code:

- `ui.css:52-56` sets `color: var(--accent)` on hover. That label is **below AA
  on five themes** — solar 3.21, meridian 3.70, sepia 3.81, bloom 4.34, light
  4.49 — and hover is currently the only state that reads as interactive.
- `AppToolbar.vue:94` binds `:class="{ active: inPaste }"` and no `.btn.active`
  rule exists anywhere in `ui.css` or `AppToolbar.css`. The File-mode toggle has
  never had an on-state.

The base `.btn` is wrong in a third way: `background: var(--bg)` on a
`--bg-panel` toolbar is _darker_ than its ground on all seven dark themes, so a
plain `.btn` reads as a recessed well there and as a raised plate on light
themes. The same declaration means opposite things depending on the palette.

## Solution

Give `.btn` a surface made of the theme's own ink at 14% alpha. Composited over
any ground it steps _toward the text_, which is the raised direction on that
ground by definition — darker on the seven light themes, lighter on the seven
dark ones. Three stops on one ladder (rest 14% / hover 22% / press 30%) so hover
intensifies an affordance that is already present instead of introducing it.

Disabled then takes sole ownership of the flat-and-dim language it used to
share, and `.btn-ghost` narrows to the dismissive twin of a primary.

| option                                               | why not                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B · Keycap** — 2px plinth, presses down            | Best press legibility (4.84 vs 3.95) and four cues, but introduces a skeuomorphic voice the rest of the app does not speak. Held as the upgrade if A tests too subtle.                                                                                           |
| **C · Slab** — opaque `--bg-elevated` + `--shadow-2` | Zero new tokens, but its two cues fail on opposite halves of the set: `--border` scores 1.24–1.59 on six of seven light grounds, `--shadow-2` is invisible on all seven dark ones (1.07–2.09). Cannot follow the button onto another ground.                     |
| **D · Outline** — accent keyline at rest             | Resting fill stays 1.00 — a colour change, not an affordance. Spends the accent on six non-primary controls, the exact failure the "Signal" note in `themes.css:11-18` records.                                                                                  |
| **E · Cluster** — one connected group plate          | Best information design, but a segmented group implies "related, possibly exclusive" semantics Share / Copy diff / Capture do not have, and a disabled item on a shared plate is the hardest "off" state of the five. Revisit if the bar grows past six actions. |
| Raise `--text-dim` / brighten `--border`             | Treats the symptom in the palette. Every theme would need hand-tuning and the fill would still be 1.00.                                                                                                                                                          |

## Scope

**In:** the `.btn` resting/hover/press/disabled recipe in `ui.css`; three tokens
in `tokens.css`; the `.btn.active` on-state; the `.btn-ghost` → `.btn` migration
across 13 components; three new floors in `check-theme-depth.mjs`; the
hierarchy rule in `docs/standards.md`; regenerated screenshots.

**Out:**

- `.btn-primary`, `.btn-destructive`, `.btn-icon`, `.btn-danger` — unchanged.
  Primary already has a fill and a shadow; icon buttons are deliberately quiet
  row affordances.
- `.row-btn`, `.rail-btn`, `.fmt-btn`, `.chip` — bespoke classes outside the
  `.btn` system. Folding them in is a separate cleanup.
- Nord's palette. Its `--text` sits at 8.4:1 on its own panel, which is why the
  press stop lands at 3.95 there. Recorded as a known outlier, not fixed by
  flattening the ladder for the other thirteen.

## Design

Token-driven. The three faces are ratios of `--text`, so they carry no palette
value and re-resolve per theme:

```css
/* tokens.css — surface-role contract */
--btn-face: color-mix(in srgb, var(--text) 14%, transparent);
--btn-face-hover: color-mix(in srgb, var(--text) 22%, transparent);
--btn-face-press: color-mix(in srgb, var(--text) 30%, transparent);
```

`.btn` keeps `--control-h`, `--radius`, `--font-md`. The keyline
`color-mix(--border 50%, --text)` already clears the 3:1 non-text floor on all 14
(weakest sepia 3.19) and is unchanged — but it was written out longhand in three
places, so it becomes `--btn-edge` (amendment, see Decisions). Elevation is
`--shadow-1`, the existing scale — it carries the lift on the light grounds and
costs nothing on the dark ones, where the lighter face carries it instead.

Because the face is a veil rather than a colour, it is **ground-independent**:
the identical declaration reads 1.26–1.48 on `--bg-panel`, 1.27–1.50 on `--bg`
and 1.25–1.56 on `--bg-elevated`. That is what lets one `.btn` work in the
toolbar, in dialogs and in the sidebar.

### Theme verdict — all 14

Parsed from `styles/themes.css`. **fill** = resting face vs `--bg-panel`,
**label** = `--text` on that face, **edge** = keyline vs `--bg-panel`,
**press** = label at the 30% stop.

| theme    | ground | verdict                                                                 | note                                                                   |
| -------- | ------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| light    | light  | pass — fill 1.34, label 11.92, edge 4.72, press 8.21                    | floating-canvas inversion; shadow reads 18.23                          |
| dark     | dark   | pass — fill 1.46, label 9.99, edge 5.49, press 5.90                     | the reported theme; shadow invisible (1.21), face carries it           |
| solar    | light  | pass — fill 1.30, label 9.40, edge 3.42, press 6.81                     | weakest accent keyline (3.21) — kept off the label                     |
| neon     | dark   | pass — fill 1.48, label 10.58, edge 5.71, press 6.22                    | accent `#22d3ee` stays on the keyline, no glow                         |
| nord     | dark   | **pass with caveat** — fill 1.46, label 5.99, edge 3.96, press **3.95** | only sub-AA stop in the set; `--text` starts at 8.4:1 on its own panel |
| sepia    | light  | pass — fill **1.26**, label 6.78, edge **3.19**, press 5.04             | weakest fill and edge of the 14; both above floor                      |
| dim      | dark   | pass — fill 1.48, label 8.80, edge 4.94, press 5.40                     |                                                                        |
| beacon   | dark   | pass — fill 1.43, label 13.77, edge 17.27, press 7.57                   | hard keyline `#e0e0e0` on `#000000` untouched                          |
| meridian | light  | pass — fill 1.29, label 9.04, edge 3.55, press 6.54                     | tinted shadow `20 40 45` reads 13.54                                   |
| linen    | light  | pass — fill 1.31, label 10.35, edge 3.68, press 7.27                    | tinted shadow `40 34 20`                                               |
| bloom    | light  | pass — fill 1.31, label 9.76, edge 3.48, press 6.97                     | tinted shadow `50 30 40`                                               |
| nyan     | dark   | pass — fill 1.45, label 10.41, edge 6.86, press 6.12                    | accent `#ff2ecb` never tints the face                                  |
| matrix   | dark   | pass — fill 1.43, label 11.78, edge 8.46, press 6.74                    | accent `#00ff41` never tints the face                                  |
| contrast | light  | pass — fill 1.38, label 13.62, edge 17.79, press 8.94                   | hard keyline `#111111` untouched                                       |

Disabled, same sweep: fill collapses to 1.00, ink to 2.25–6.33, keyline to
1.24–16.87 — three axes of separation from the resting state instead of one.

## Security rules touched

None. No IPC handler, no fs, no crypto, no new dependency, no `shell.openExternal`
call site, no `v-html`. `check-theme-depth.mjs` is a build-time script that reads
two CSS files and writes nothing. The `.vue` edits are class-attribute changes
only — no template logic, no new props.

## Test plan

- **e2e** — `e2e/ui-affordances.spec.mjs`, three tests, each watched red first:
  1. _a resting toolbar button has a surface of its own_ — read the computed
     `background-color` of an enabled `.btn` and of `.toolbar`, assert the WCAG
     contrast between them is ≥ 1.2. Fails today at exactly 1.00.
  2. _disabled differs from resting on more than opacity_ — assert the enabled
     button has a non-transparent background and a `box-shadow`, and the
     disabled one has neither. Fails today: both are `rgba(0,0,0,0)`.
  3. _the paste toggle shows an on-state_ — click into paste mode, assert the
     toggle's computed background differs from its resting one. Fails today:
     `.active` matches no rule.
- **unit** — none. `.vue` and `ui.css` are deliberately outside the measured
  set (`vitest.config.mjs`); the mechanical cover is `check-theme-depth.mjs`,
  which gains three floors and runs inside `npm run check`.
- **red → green** — record each failure message in Validation before fixing.
- **seed fixtures** — unchanged. No new format, no changed data shape.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | no      | no architecture or feature-status change; the embedded screenshots are re-rendered but their `alt` text still describes the same states                                                                                                                                                              |
| `docs/screenshots/*.png` | **yes** | the toolbar appears in every captured frame — `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff` all show restyled buttons                                                                                                                                               |
| `docs/roadmap.md`        | no      | a defect fix inside an existing surface, not a roadmap item moving open → done                                                                                                                                                                                                                       |
| `docs/brand/roadmap.svg` | no      | same reason                                                                                                                                                                                                                                                                                          |
| `docs/*.md`              | **yes** | `standards.md` — the button-hierarchy rule (`.btn` is the neutral workhorse, `.btn-ghost` is the dismissive twin of a primary) and the three new `check-theme-depth` floors. Without it the next contributor reaches for `.btn-ghost` again. `security.md` / `ipc-security.md` / glossary unaffected |

## Implementation plan

- [x] 1. Add the three failing e2e tests to `e2e/ui-affordances.spec.mjs`; run
      `make e2e` and record each red failure.
- [x] 2. `tokens.css` — add `--btn-face` / `--btn-face-hover` / `--btn-face-press`
      to the surface-role contract block.
- [x] 3. `ui.css` — `.btn` takes the face, full `--text` ink and `--shadow-1`;
      `.btn:hover` steps the face and keeps the accent on the border only;
      add `.btn:active`; rewrite `.btn:disabled` as flat + `--border` + dim +
      no shadow.
- [x] 4. `ui.css` — add `.btn.active` (pressed face + accent keyline) so a
      toggle has an on-state.
- [x] 5. Migrate 29 buttons in 13 components from `btn-ghost` to `btn`, leaving
      every Cancel / Close / Dismiss / Keep-open as a ghost.
- [x] 6. `check-theme-depth.mjs` — teach `evalColor` the
      `color-mix(in srgb, X N%, transparent)` alpha form, composite it over the
      ground under test.
- [x] 7. `check-theme-depth.mjs` — add the three floors:
      `btn-face/panel ≥ 1.25`, `btn-label/face ≥ 4.5`, `btn-edge/panel ≥ 3.0`.
- [x] 8. `npx prettier --write` on touched files only.
- [x] 9. `docs/standards.md` — record the hierarchy rule and the new floors.
- [x] 10. Regenerate the five screenshots in the container; check each frame
      rather than trusting the run.
- [x] 11. `npm run check` + `make e2e` green; `/validate`.

## Decisions

| date       | decision                                              | why                                                                                                                                                                                                             | rejected                                                                              |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 2026-08-02 | Veil (A) over the four other directions               | only direction whose surface is ground-independent (1.25–1.56 across all three surface roles), so one `.btn` works in toolbar, dialog and sidebar                                                               | keycap, slab, outline, cluster — see Solution                                         |
| 2026-08-02 | Ladder stops at 14 / 22 / 30                          | 24% is the alpha ceiling where nord's label still clears AA at hover; 30% is press-only and transient                                                                                                           | a flat 16/26/34 ladder — puts nord's hover under AA too                               |
| 2026-08-02 | Hover keeps `color: var(--text)`                      | today's accent label is already sub-AA on five themes, and over a face it would fail on ten                                                                                                                     | keeping the accent label                                                              |
| 2026-08-02 | Tokens live in `tokens.css`, not `themes.css`         | they are ratios of `--text`, not palette values, and belong beside the surface-role contract they extend                                                                                                        | `themes.css :root`, where `--bg-elevated` lives                                       |
| 2026-08-02 | Nord's 3.95 press stop is recorded, not fixed         | the fix is one line in nord's palette, not a weaker press on the other thirteen                                                                                                                                 | flattening the ladder                                                                 |
| 2026-08-02 | `.btn-icon` stays quiet                               | a row/header glyph affordance is deliberately recessive; giving it a plate would make every row heavy                                                                                                           | migrating it with the rest                                                            |
| 2026-08-02 | **Amendment:** added a fourth token, `--btn-edge`     | the keyline expression was written out longhand in `.btn`, `.btn-ghost` and `.sidebar-toggle` — three copies of one value is the drift this repo keeps hitting, and the new guard rule needs a token to resolve | leaving the longhand and having the guard grep `ui.css`                               |
| 2026-08-02 | **Amendment:** `.btn-primary` is no longer untouched  | `.btn:active` / `.btn:disabled` are more specific than `.btn-primary`, so without explicit rules a pressed or unavailable Save lost its accent fill and became indistinguishable from a disabled secondary      | letting the neutral face win, which strips the one affirmative action of its identity |
| 2026-08-02 | `.btn-ghost` gains a hover ink and `box-shadow: none` | `.btn:hover` no longer recolours a label, so a ghost had no hover cue left; and it must opt out of the lift `.btn` now carries                                                                                  | leaving hover silent                                                                  |

## Validation

Recorded as fact.

- [x] `/validate` — 3 findings, full report in `quality-audit.md`. One is an
      untracked duplicate test file left by another session
      (`tests/main/autoBackupOrig.test.js`, byte-identical to
      `autoBackup.test.js`), reported and deliberately not deleted. Two are the
      known contrast trade-offs already recorded above (nord's press stop,
      edge-vs-face on sepia/solar).
- [x] `npm run check` — exit 0. `style tokens ok (91 stylesheets)` ·
      `✓ theme depth ok (14 themes)` · `Test Files 128 passed | 1 skipped (129)`
      · `Tests 1891 passed | 2 skipped (1893)`. Coverage floors met, none
      lowered.
- [x] UI seen running — `make e2e` in Docker: **297 passed / 2 skipped / 0
      failed**. The first run flagged
      `mermaid-repair.spec.mjs:37 › the repair is what gets saved` via the
      fixture's renderer-error detector; it reproduced neither in isolation with
      this change nor in the container against stashed `main`, and the re-run was
      clean — a pre-existing flake, recorded not fixed.
- [x] every Docs-impact "yes" done — `docs/standards.md` carries the hierarchy
      rule and the new floors; all five screenshots regenerated and inspected.
- [x] `make local-seed` — n/a, no format or data-shape change.
- [x] token usage measured, header row filled.

**Red → green, the three tests, verbatim from the failing run:**

1. `Error: resting background was rgba(0, 0, 0, 0)` — `expect(0).toBeGreaterThan(0)`
2. `Error: a resting button paints a plate` — `expect(0).toBeGreaterThan(0)`
3. `Error: the pressed toggle must read differently from a resting button` —
   `expect(1.0737658612004244).toBeGreaterThan(1.15)`

Two of the three then failed a second time for reasons that were the _tests'_
fault, not the source's, and both were real information: the disabled-button
selector was catching the primary Save (which now keeps its accent fill on
purpose), and the on-state was being read mid-transition, where Chromium reports
an interpolated `oklab()` rather than the declared colour.

### Token usage

Window `2026-08-02T16:05:23Z → 17:25:59Z`, 119 requests.

| category    |         tokens |
| ----------- | -------------: |
| input       |            222 |
| output      |         76,815 |
| cache write |        944,458 |
| cache read  |     49,773,634 |
| **total**   | **50,795,129** |

Cache read dominates: context re-sent each turn, so the total is tokens
_processed_, not a cost. The window covers only this feature — the design
proposal that preceded it was finished before the baseline was taken.

**Outcome:** shipped. The resting `.btn` now carries a face, a 3:1 keyline and a
lift on all 14 themes (fill 1.26–1.48 where it was 1.00 everywhere), disabled
owns the flat-and-dim language it used to share, and 29 buttons across 13
components stopped being ghosts. Two defects found on the way were fixed with
it: the hover label no longer uses `--accent`, which was under 4.5:1 on five
themes, and `.btn.active` exists, so AppToolbar's paste-mode binding finally
styles something. `check:themes` now measures the affordance, which is what was
missing when it regressed.
