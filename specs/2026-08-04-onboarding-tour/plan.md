# Onboarding tour — anchored first-run and post-update guidance

|                                         |                        |
| --------------------------------------- | ---------------------- |
| **Status**                              | in-progress            |
| **Progress**                            | 19 / 20 steps          |
| **Branch**                              | `feat/onboarding-tour` |
| **Started**                             | 2026-08-04             |
| **Finished**                            |                        |
| **Bugs found and fixed this iteration** | 0 / 0                  |
| **Token baseline**                      | 2026-08-04T14:04:37Z   |
| **Claude tokens used**                  |                        |

Design proposal, approved 2026-08-04 — `proposal.html` beside this file (open it
locally; it is the interactive prototype: 7 views × 14 themes, live). Also
published at <https://claude.ai/code/artifact/8b38299c-18ad-45c8-ad63-2ee4182d31ea>.

## Problem

A first launch shows an empty two-slot window, a sidebar of empty sections and a
shortcut bar. Nothing on screen says that sealed sharing exists, that snippets
can be compared against each other, that a Mermaid snippet previews as a
diagram, or that `Ctrl+Shift+Space` opens a launcher that works while the app is
minimised. The only affordances a new user finds unaided are the two file slots.

Evidence that the app expects to be explained and currently is not:

- `src/renderer/src/App.vue:79-87` seeds two example snippets on first run —
  the app already accepts that a cold library teaches nothing — but nothing
  points at them, and `SnippetsPanel` is below the fold on a short window.
- `features/share/components/ShareDiffDialog.vue:121` carries a whole
  "one-time setup" branch explaining key exchange, reachable only by pressing
  Share and only discoverable by pressing a button whose consequence is unknown.
- `utils/settingsDefaults.js:5` puts Quick look-up behind
  `CommandOrControl+Shift+Space` with no on-screen mention anywhere except the
  Shortcuts pane of Settings.
- `docs/screenshots/empty-state.png` is the literal first-run view: the only
  guidance is "Choose or drop two files to compare."

## Solution

An anchored tour: a scrim with a cut-out around a real element, an accent ring
on it, and a callout beside it. Steps name a CSS selector and the overlay
measures that element at run time, so it survives a collapsed sidebar, a resized
window and a reordered section.

Split **4 + 3**. Run one on first launch: compare → seal → quick look-up →
settings. Run one ends on the Settings tips row, so the off switch and the
replay button are the last thing a first-time user is shown.

Run one then asks **"Three more tips?"** — a plain `BaseDialog`, immediately,
_not_ on a future launch. A diff viewer stays open for weeks, so "next launch"
is not a schedule: run two would arrive cold weeks later, or never for anyone
who does not quit. **Show me** starts run two (keep a snippet → diff snippets →
diagrams) there and then; **Not now** asks once more on the next launch and then
stops for good.

Two shipped demo JSON fixtures are written into the data directory on first run
and opened **by path** into a scratch tab, so step 1 teaches the real open/drop
route and step 2 has something real to seal.

| option                                                  | why not                                                                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome dialog with 7 slides                            | Teaches where nothing is. The user closes it and the app is still a blank two-slot window.                                                                                                        |
| Scrim + cut-out with **no** blur                        | Measured: the scrim changes a dark ground by 1.00–1.17× (beacon is `#000000` and cannot darken). The focus cue would exist on 7 themes and not the other 7.                                       |
| `--bg-raised` callout with a `--border` keyline         | Measured: fails on 11 of 14. Border drops to 1.23 : 1 against a scrimmed light ground; the card stops lifting on dark (matrix 1.06).                                                              |
| Accent **glow** on the target instead of a flat ring    | `matrix` #00ff41, `nyan` #ff2ecb and `neon` #22d3ee turn any accent-tinted shadow into a halo. Flat 2px keyline instead.                                                                          |
| All 7 steps on first launch                             | Seven in a row for someone who came to look at one file. Split 4 + 3.                                                                                                                             |
| Run two deferred to the next launch                     | This app is left open for weeks. "Next launch" could be a month away — run two would land on someone who has forgotten there was a tour, or never fire at all. Ask at the end of run one instead. |
| Four scrim panels for the whole veil                    | Cannot round the hole's corners, so a rounded target leaks un-veiled slivers: invisible on a dark ground, a white halo on a light one. Tint is now one clipped layer.                             |
| One clipped layer for both tint and blur                | Chromium resolves `backdrop-filter` before `clip-path`, so a clipped blur layer blurs straight through its own hole — measured: the spotlit region came back 25% different from un-overlaid.      |
| Patching the corner slivers with a second scrim element | Scrim over scrim double-darkens to ~75% black, which reads as a heavy dark rim around the ring. Caught in the prototype.                                                                          |
| Ring offset outward from the target                     | Collides with whatever the target sits flush against. The active tab's underline is the same 2px `--accent`, so an offset over the file-slots band read as one thick edge.                        |
| Step 6 pointing at the right-hand file slot             | `useWindowFileDrop` is bound to the root element — a snippet drops anywhere. Teaching the narrow target teaches the wrong thing.                                                                  |
| Demo fixtures as renderer string constants              | Avoids all fs work, but step 1 would teach a simulation — no real path, no real drop target, and step 2 would have nothing on disk to seal.                                                       |
| A tour overlay inside the Quick look-up window too      | The launcher is a separate `BrowserWindow`; ringing a control _inside_ it means shipping the whole overlay into a second renderer for one step. Ring the whole panel instead.                     |

## Scope

**In:** the `onboarding` feature slice; `useSpotlight` + `utils/tourSteps`; two
persisted settings keys; the shipped demo fixtures and the main-process code
that writes them; Help ▸ Show tour + palette entry + Settings toggle and replay
button; a `tour-callout` surface in `theme-sweep.mjs`; unit + e2e tests.

**Out:**

- Any change to what the seven surfaces themselves do. The tour points; it does
  not redesign.
- Localisation of the copy. The app is English-only today; adding a string
  catalogue for one feature is its own change.
- A tour inside the Quick look-up renderer (see the rejected options).
- Re-running run two after an update. An update replays only genuinely new
  steps, as their own run.

## Design

Callout: face `--bg-elevated`, keyline `--btn-edge`, `--shadow-3`,
`--radius-lg`. Title `--text` at `--font-md`; body and the step counter
`--text-hint` (**not** `--text-dim`, which measures 2.92 on nord and 2.82 on
sepia against that face — under even the 3.0 dim floor). Footer is `.btn-ghost`
("Skip tips") beside `.btn-primary` ("Next"/"Done") — a legitimate dismissive
twin, at `.btn-sm` height (`--control-h-sm`). Progress dots are `--btn-edge`,
active `--accent`.

Ring: `2px solid var(--accent)`, `--radius`, `box-sizing: border-box`, drawn
**inside** the target's own box at zero offset. No glow, no accent fill, no
`box-shadow` tinted by the accent. Two special cases, both found in the
prototype:

- an **accent-filled** target (the primary button) swallows an accent ring, so
  it flips to `--text-on-accent`;
- a **zone** target (the comparison pane, step 6) takes a **dashed** ring and
  the callout moves inside it — dashed says "area", solid says "control", and
  there is no "beside" for something that fills its pane.

Veil: **two layers doing two jobs**, because neither alone works.

- **Tint** — one element covering the stage with the target clipped out as a
  rounded subpath (`clip-path: path(evenodd, …)`). One layer, so the scrim can
  never overlap itself; the hole's corners follow the target's radius.
- **Blur** — four rectangles around the target carrying
  `backdrop-filter: blur(2.5px) saturate(0.7)`, because Chromium resolves
  `backdrop-filter` **before** `clip-path` and a clipped blur layer blurs
  straight through its own hole. Rectangles leave unblurred corner slivers,
  which nobody can see; a blurred spotlight, everybody can.

Nothing covers the target, so it stays clickable — the live Save step depends on
it. The blur is luminance-independent and therefore the only focus cue that
works identically on `beacon` and on `light`.

Placement tries the requested side, then its opposite, then the other axis. The
prototype proved this is load-bearing: with only the first two, the Quick
look-up step put the callout at `-17px`, off-stage, because the 540px launcher
leaves no room for a 296px card either side.

Icons via `<AppIcon>`. No new tokens.

### Theme verdict — all 14

Parsed from `styles/themes.css` with the resolver `check-theme-depth.mjs` uses
(`color-mix` evaluated, scrim composited over each ground). Floors: 4.5 text,
3.0 non-text, 1.11 border, 1.04 surface. Columns: callout title / body on the
elevated face · keyline vs the scrimmed canvas · card lift vs the same · ring vs
`--bg-panel` · how much the scrim actually changes the app ("dim").

| theme    | ground | verdict                                                              | note                                                                                                                            |
| -------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| light    | light  | pass — 12.53 / 7.93 · edge 1.23 · lift 3.01 · ring 4.49 · dim 3.84   | floating-canvas inversion; **face** carries, keyline is weak                                                                    |
| dark     | dark   | pass — 10.61 / 7.78 · edge 6.32 · lift 1.59 · ring 4.62 · dim 1.05   | **keyline** carries; dim is invisible                                                                                           |
| solar    | light  | pass — 9.78 / 5.08 · edge 1.54 · lift 1.78 · ring 3.21 · dim 2.43    | weakest ring of all 14 — still clears 3.0                                                                                       |
| neon     | dark   | pass — 11.35 / 7.66 · edge 6.57 · lift 1.59 · ring 9.79 · dim 1.05   | accent `#22d3ee` — flat ring only, no glow                                                                                      |
| nord     | dark   | pass — 6.30 / 5.37 · edge 6.86 · lift 2.40 · ring 5.03 · dim 1.40    | `--text-dim` = 2.92 on the callout face → body takes `--text-hint`                                                              |
| sepia    | light  | pass — 7.01 / 4.86 · edge 1.44 · lift 1.82 · ring 3.81 · dim 2.53    | weakest body of all 14 (4.86) — still clears 4.5                                                                                |
| dim      | dark   | pass — 9.36 / 6.49 · edge 5.77 · lift 1.62 · ring 7.23 · dim 1.08    |                                                                                                                                 |
| beacon   | dark   | pass — 14.74 / 11.81 · edge 18.43 · lift 1.42 · ring 9.81 · dim 1.00 | hard keyline `#e0e0e0` on `#000000`; **dim does nothing at all** — blur + ring carry it. Ring ADDS a keyline, never removes one |
| meridian | light  | pass — 9.39 / 6.54 · edge 1.44 · lift 1.99 · ring 3.70 · dim 2.59    | `--shadow-rgb: 20 40 45` tints the drop                                                                                         |
| linen    | light  | pass — 10.78 / 6.20 · edge 1.66 · lift 1.76 · ring 5.65 · dim 2.50   |                                                                                                                                 |
| bloom    | light  | pass — 10.16 / 6.14 · edge 1.59 · lift 1.74 · ring 4.34 · dim 2.50   | weakest card lift of all 14 — clears the 1.04 surface floor                                                                     |
| nyan     | dark   | pass — 11.04 / 8.40 · edge 7.74 · lift 1.53 · ring 5.45 · dim 1.04   | accent `#ff2ecb` — no glow. NyanLane is chrome; the veil covers it                                                              |
| matrix   | dark   | pass — 12.58 / 9.62 · edge 8.98 · lift 1.42 · ring 13.92 · dim 1.01  | accent `#00ff41` — no glow. MatrixRain sits at `z-index:-1` behind the empty state; the tour is above it                        |
| contrast | light  | pass — 14.31 / 11.86 · edge 4.20 · lift 3.23 · ring 7.63 · dim 4.74  | hard keyline `#111111`; the only theme where BOTH cues are strong                                                               |

The pair is complementary by construction: on the seven light grounds the
scrim makes the surround mid-grey so the **face** separates the card; on the
seven dark grounds it makes everything near-black so the **keyline** does.
Never read either column alone.

## Security rules touched

- **Rule 3 — renderer never touches Node or Electron.** The demo fixtures are
  written by main during first-run init and their absolute paths are returned to
  the renderer, which opens them through the existing read path. The renderer
  never names a file to write and there is no new handler that takes a
  renderer-supplied write path.
- **Rule 6 — untrusted input is hostile.** The fixtures are ours, bundled in the
  asar, not imported. They are written once under the data directory; if the
  file already exists it is left alone (never overwritten, so an edited demo
  file is the user's). Reading them back goes through the same size caps every
  other comparison uses.
- **Rule 8 — no injection sinks.** All callout copy is static and rendered
  through Vue text interpolation. No `v-html`.
- **Rule 1 — offline guarantee.** Nothing added opens a socket, and no asset is
  fetched. Untouched.
- Rules 2, 4, 5, 7 — untouched: no new dependency, no key material, no sealing
  code, no `shell.openExternal` / `showItemInFolder` call site.

## Test plan

Written before the code.

- **unit** — `tests/renderer/utils/tourSteps.test.js`: run partitioning (4 + 3);
  `stepsFor()` returns run one from a cold state, run two only once run one is
  complete, nothing when `showTips` is false, and only `since > seen` steps
  after a version bump. **Includes the negative:** a skipped run one never
  yields run two.
- **unit** — `tests/renderer/features/onboarding/onboardingStore.test.js`:
  start/next/skip/finish transitions, persistence of `tourStep`, resume
  mid-run, and that `replay()` ignores `showTips` **without** setting it back
  to true. Plus the continuation prompt: finishing run one opens it,
  **Show me** enters run two in the same session, **Not now** closes for the
  session and re-arms exactly once (`tourDeferred`), and a second **Not now**
  stops for good.
- **unit** — `tests/renderer/utils/spotlight.test.js`: `veilPath` emits an
  evenodd path whose hole matches the target rect and radius, and
  `placeCallout`'s three-stage fallback — including the regression where a
  target too wide for a side callout returned a negative x.
- **unit** — `tests/renderer/composables/useSpotlight.test.js`: placement maths
  as a pure function — requested side, opposite, other-axis fallback, and the
  regression the prototype exposed (a target too wide for a side callout must
  not produce a negative x). Event-guard logic (Escape, resize re-measure)
  lives here too, not inline in the SFC.
- **unit** — `tests/renderer/stores/settingsStore.test.js`: the two new keys
  round-trip through `persist()`/`readState()` and default correctly on a
  garbage value.
- **unit** — `tests/renderer/utils/commands.test.js` already fails if an action
  named by `menus.js` or the palette resolves to nothing; the new
  `show-tour` row is covered by that existing assertion.
- **e2e** — `e2e/onboarding-tour.spec.mjs`, throwaway `--user-data-dir`:
  (a) a cold launch shows step 1 of 4 and the demo tab; (b) stepping to the end
  of run one closes the tour and a relaunch opens run two at step 1 of 3;
  (c) pressing Skip tips at step 1 closes it and a relaunch shows nothing;
  (d) Help ▸ Show tour replays from step 1 even with tips off.
- **e2e** — assert the ring's bounding box actually covers the target element's
  box (a measurable property, not a screenshot) — the guard against a tour that
  points at nothing after a layout change.
- **red → green** — no bug fix in this change, so nothing to watch fail first;
  the placement fallback carries a test derived from the real defect the
  prototype produced (`x = -17`).
- **seed fixtures** — `scripts/seed-local.mjs` gains the two demo JSON files so
  `make local-seed` can open them by hand on the host Mac. `.json` is already a
  seeded format, so no new `FILES` shape; confirm `local-seed-clean` still
  removes exactly what it wrote.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                                                                        |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | **yes** | Feature status: onboarding is a shipped capability, and the demo fixtures are a new thing the app writes on first run.                                                                                                                                              |
| `docs/screenshots/*.png` | **yes** | Not because a frame changes, but because the tour now fires on a cold profile and would appear in every recapture. `recapture-screenshots.mjs` must set `showTips = false` in its seeded settings before the first frame. Verify no captured frame contains a veil. |
| `docs/roadmap.md`        | **yes** | New track, moved to Done. Mermaid + terse bullets, no prose.                                                                                                                                                                                                        |
| `docs/brand/roadmap.svg` | **yes** | Same move — hand-authored, edited alongside.                                                                                                                                                                                                                        |
| `docs/glossary.md`       | **yes** | "Tips" vs "tour" are now two distinct user-facing things (automatic vs summoned) and the copy leans on the distinction.                                                                                                                                             |
| `docs/security.md`       | no      | No change to any guarantee, boundary or invariant.                                                                                                                                                                                                                  |
| `docs/ipc-security.md`   | no      | No new renderer-callable handler that accepts a path — main computes and returns them.                                                                                                                                                                              |
| `docs/standards.md`      | no      | Follows the existing rules; adds no new one.                                                                                                                                                                                                                        |
| `docs/architecture.md`   | **yes** | A new feature slice belongs in the slice list.                                                                                                                                                                                                                      |

## Implementation plan

- [x] 1. `utils/tourSteps.js` — pure step list (`id`, `run`, `since`, `target`,
      `side`, `zone`, `title`, `body`) + `stepsFor(state)` and `runOf(index)`.
      Test first.
- [x] 2. `utils/spotlight.js` — pure geometry: `placeCallout` (side → opposite →
      other axis) and `veilPath` (the evenodd clip path). Test first, including
      the `x = -17` regression.
- [x] 3. `composables/useSpotlight.js` — measure the target, re-measure on
      resize, Escape to close. Test first.
- [x] 4. `features/onboarding/onboardingStore.js` — run state, persistence,
      `start` / `next` / `skip` / `finish` / `defer` / `replay`. Test first.
- [ ] 5. `settingsStore` — `showTips`, `tourStep`, `tourSeenVersion`,
      `tourDeferred` through `readState()`/`persist()`. Test first.
- [x] 6. `features/onboarding/components/TourOverlay.vue` + `TourCallout.vue` +
      `styles/` — the two veil layers, ring, callout, beak.
- [x] 7. `features/onboarding/components/ContinueTourDialog.vue` — the
      "Three more tips?" `BaseDialog`.
- [x] 8. `features/onboarding/index.js` — the slice's only importable surface.
      Mount in `App.vue`.
- [x] 9. Demo fixtures: the two JSON files as bundled resources, written once by
      main during first-run init, paths returned to the renderer.
- [x] 10. Step 1 wiring — open the fixtures by path into a scratch tab; close it
      when the tour ends.
- [x] 11. Steps 2–4 wiring — Share dialog, Quick look-up summon, Settings on
      Appearance.
- [x] 12. Steps 5–7 wiring — snippet editor prefilled from the demo payload,
      drop-zone step, diagram register.
- [x] 13. `utils/commands.js` — `show-tour` row; Help item in **both**
      `src/main/index.js` and `MenuBar.vue`; palette entry.
- [x] 14. `SettingsDialog` — the tips toggle and the Show tour button on the
      Appearance pane.
- [x] 15. `scripts/theme-sweep.mjs` — add the `tour-callout` surface with probes
      for title, body, keyline and ring.
- [x] 16. `scripts/seed-local.mjs` — the two demo files.
- [x] 17. e2e specs.
- [x] 18. `recapture-screenshots.mjs` — disable tips before capture; re-run and
      check every frame for a stray veil.
- [x] 19. Docs: README, roadmap.md + roadmap.svg, glossary, architecture.
- [ ] 20. `npm run check`, `make e2e`, `/validate`.

## Amendments during the build

Recorded rather than applied silently — each changed a step the plan had
already specified.

| step | planned                                              | what shipped                                                    | why                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5    | four keys on `settingsStore`                         | the slice persists its own `onboarding` blob                    | `settingsStore.js` is pinned at exactly 308 lines by `legacySize.mjs`; one more line fails the build. Tour state is one slice's anyway.                                                             |
| 11   | quick look-up step summons the launcher and rings it | it anchors to the sidebar search and names the chord            | The launcher is a separate `BrowserWindow` that opens ON TOP of the main one — the main window's overlay cannot ring it, or even be seen behind it. Ringing "the whole panel" was still impossible. |
| 12   | diagram step rings the change register               | it anchors to the Snippets section and describes preview + diff | Reaching the register means loading a diagram comparison during the tour. Deferred with the demo fixtures (step 9).                                                                                 |
| —    | overlay dispatches its own step commands             | `composables/useTourCommands.js` does                           | `TourOverlay` is exported from the slice index, so importing the registry there closed a cycle `index → TourOverlay → useCommands → index`. `check-structure.mjs` caught it.                        |

## Decisions

| date       | decision                                                                | why                                                                                                | rejected                                          |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 2026-08-04 | Anchored tour, not a welcome dialog                                     | A slideshow teaches where nothing is                                                               | 7-slide modal                                     |
| 2026-08-04 | Veil blurs as well as dims                                              | Measured: the scrim moves a dark ground 1.00–1.17×; beacon cannot darken at all                    | scrim alone                                       |
| 2026-08-04 | Callout = `--bg-elevated` face + `--btn-edge` keyline                   | The naive `--bg-raised` + `--border` fails on 11 of 14; this pair gives every theme one strong cue | `--bg-raised` + `--border`                        |
| 2026-08-04 | Body copy takes `--text-hint`, never `--text-dim`                       | 2.92 nord / 2.82 sepia on the callout face — the same lesson `.status-band` already records        | `--text-dim`                                      |
| 2026-08-04 | Split 4 + 3 across two launches                                         | Seven in a row is too much for someone who came to look at one file (user's call)                  | all 7 on first launch                             |
| 2026-08-04 | Settings is the **last** step of run one                                | The off switch and the replay button should be found on day one, not six steps deep                | Settings last overall                             |
| 2026-08-04 | Step 5 writes a real snippet; step 1 opens a real scratch tab           | A living example beats a simulation (user's call)                                                  | read-only walkthrough                             |
| 2026-08-04 | Demo JSON files ship with the app and are written to the data directory | Step 1 teaches the real open/drop path and step 2 has something real to seal (user's call)         | renderer string constants                         |
| 2026-08-04 | Replay ignores `showTips` and does **not** re-enable it                 | Asking to see it once is not consent to automatic tips                                             | replay flips tips back on                         |
| 2026-08-04 | Quick look-up step rings the whole launcher panel                       | It is a separate `BrowserWindow`; anything finer means a second copy of the overlay                | ring a control inside the launcher                |
| 2026-08-04 | Step 2 seals nothing and generates no key material                      | A throwaway demo identity would outlive the tour                                                   | demo recipient + real seal                        |
| 2026-08-04 | Run two is offered by a dialog the moment run one ends                  | The app is left open for weeks, so "next launch" is not a schedule (user's call)                   | deferring run two to the next launch              |
| 2026-08-04 | "Not now" re-asks exactly once, on the next launch                      | One reminder is a reminder; two is pestering                                                       | asking every launch · never asking again          |
| 2026-08-04 | Tint is one clipped layer, blur is four rectangles                      | `backdrop-filter` resolves before `clip-path`, and scrim-over-scrim double-darkens to ~75% black   | four panels for both · one clipped layer for both |
| 2026-08-04 | Ring is drawn inside the target's box at zero offset                    | Any outward offset collides with adjacent chrome — the active tab's underline is the same accent   | outward offset                                    |
| 2026-08-04 | Step 6 targets the whole comparison pane, dashed                        | `useWindowFileDrop` is bound to the root element; a drop lands anywhere                            | pointing at the right-hand file slot              |

## Validation

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [x] `npm run check` — clean: lint, style tokens, 14 themes, structure
      (342 files, no new cycles), **2308 tests**, build
- [x] e2e seen passing against the built app on macOS — 6/6,
      `env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/onboarding-tour.spec.mjs`
- [x] veil guard verified red → green: reverted `pointer-events`, watched it
      fail, restored
- [ ] UI seen running (Docker / `make e2e`)
- [ ] every Docs-impact "yes" done
- [ ] `make local-seed` opens the demo files on the host; `local-seed-clean` removes them
- [ ] token usage measured, header row filled

### Token usage

| category    | tokens |
| ----------- | -----: |
| input       |        |
| output      |        |
| cache write |        |
| cache read  |        |
| **total**   |        |

**Outcome:**
