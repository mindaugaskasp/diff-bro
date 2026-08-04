# Onboarding tour — state

Branch `feat/onboarding-tour`. Green: `npm run check` exit 0 · 2341 tests ·
13/13 e2e (`env -u ELECTRON_RUN_AS_NODE npx playwright test
e2e/onboarding-tour.spec.mjs`).

Design proposal: `proposal.html` beside this file. Plan, amendments and
decisions: `plan.md`.

---

## What the tour is now

Ten steps, split **6 + 4**. Run one on a first launch; the "Three more tips?"
dialog offers run two the moment it ends.

| #   | id               | points at                  | its Next does          |
| --- | ---------------- | -------------------------- | ---------------------- |
| 1   | `compare`        | the file slots             | loads the demo pair    |
| 2   | `share`          | Share (comparison stroked) | —                      |
| 3   | `library`        | the sidebar search         | clears the demo search |
| 4   | `settings-open`  | the menu bar               | opens Settings         |
| 5   | `settings-panes` | the Settings pane list     | —                      |
| 6   | `settings-tips`  | the tips row               | closes Settings        |
| 7   | `snippet-new`    | the sidebar `+`            | opens the editor       |
| 8   | `snippet-save`   | Save (editor stroked)      | closes the editor      |
| 9   | `snippet-drag`   | the comparison pane (zone) | —                      |
| 10  | `diagram`        | the Snippets section       | —                      |

**A step's command fires on Next, never on entry.** That inversion is the whole
answer to "random windows opening up out of the blue". Four bookends:

- `advance` — Next runs it, then the step after lands inside what opened
- `enter` — on arrival; the one effect allowed there, and only INSIDE the ring
  (step 3 types into the search)
- `leave` — when the step is left in EITHER direction
- `undo` — what Back runs to reverse a step's own `advance`

### Where things live

- `utils/tourCopy.js` — every word, keyed by step id. **Edit wording here.**
- `utils/tourSteps.js` — the schedule and what each step points at
- `utils/spotlight.js` — pure geometry (hole, ring, callout placement, strokes)
- `composables/useSpotlight.js` — measures, re-measures, scrolls a target into view
- `features/onboarding/onboardingStore.js` — run state and transitions
- `features/onboarding/tourDemo.js` — the stage: the demo pair, the example
  snippet, the typed search, and `clearStage` which removes all of it
- `composables/useTourCommands.js` — starts the tour and runs the commands its
  steps ask for (the registry cannot be reached from the slice)

---

## Rules the build learned the hard way

- **Nothing the tour puts on screen survives it.** The demo comparison lives in
  its own scratch tab, marked `ephemeral` so a quit mid-tour cannot leave it in
  the session either. The example snippet is deleted by name-minus-what-was-
  there-before, because pressing the ringed Save makes a copy the tour never
  sees the id of.
- **A hole is inert unless the step invites the press.** Only the ringed Save
  and the drop zone are live; everything else blocks the pointer and says why on
  hover. A click on a file slot mid-tour opened a picker over the card.
- **A missing target still gets a card** — centred, ringless, Next and Skip
  reachable. macOS has no in-app menu bar, so step 4 relies on this; so does a
  collapsed sidebar.
- **A step is stroked, not blurred, where the step is ABOUT a region** — the
  comparison being sealed, the Settings dialog, the editor. `context` softens
  the veil and outlines it; area strokes are inset 4px so they do not double up
  with the border the region already sits on.
- `file:read` refuses any path under userData (`files.js:214-217`) — the
  arbitrary-file-read guard. Demo files return **contents**, never a path.
- The Quick look-up launcher is a separate `BrowserWindow`; the main window's
  overlay can neither ring it nor be seen behind it.
- The veil is two layers by necessity: tint is one clipped element (evenodd),
  blur is four rectangles, because Chromium resolves `backdrop-filter` before
  `clip-path`.
- Callout is `--bg-elevated` + `--btn-edge`; `--bg-raised` + `--border` failed
  on 11 of 14.
- `settingsStore.js` is pinned at exactly 308 lines by `legacySize.mjs`; tour
  state lives in the slice's own persisted `onboarding` key.
- **Format touched files only** — `npx prettier --write <files>`.

---

## Still open

- The diagram step (10) points at the Snippets section rather than a loaded
  diagram comparison — reaching the change register means loading a diagram diff
  mid-tour.
- `make e2e` has not been run in the container this session (the specs were run
  natively on macOS, 13/13).
- Screenshots not regenerated. `recapture-screenshots.mjs` disables tips and
  throws if `.tour` is on screen, but `make screenshots` needs the container.
- `make local-seed` / `local-seed-clean` not re-verified against the demo files.
