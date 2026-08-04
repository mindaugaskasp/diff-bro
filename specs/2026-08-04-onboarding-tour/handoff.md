# Onboarding tour — handoff

Branch `feat/onboarding-tour`, 8 commits, tip `1b37c64`. Green:
`npm run check` exit 0 · 2310 tests · 7/7 e2e
(`env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/onboarding-tour.spec.mjs`).

Design proposal: `proposal.html` beside this file. Plan + amendments: `plan.md`.

---

## The verdict to act on

> "Whole onboarding should be hand holding step by step, instead of random
> windows opening up out of the blue… Currently onboarding is lackluster."

**Root cause, one line:** a step's command fires when the step is **entered**
(`composables/useTourCommands.js` watches `currentStep.command`), so the window
opens and _then_ the callout explains it.

**The fix is an inversion:** fire on **advance** — the step points at the
control, Next performs the action, the next step lands inside what opened. Every
"out of the blue" complaint is this one choice.

Reworked as two beats each:

| today (abrupt)                           | wanted                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| step 5 opens the snippet editor on entry | ring the `+` in the sidebar's SNIPPETS header → Next opens the editor → ring Save                      |
| step 4 opens Settings on entry           | ring the way in (menu bar off-mac, `⌘,` in copy on mac) → Next opens it → walk the panes one at a time |

Three things must land together — 2 and 3 are blockers, not polish:

1. Dispatcher changes semantics; every existing `command` must be re-pointed or
   it double-fires.
2. **The wedge bug (O3 below) becomes blocking** — pointing at the sidebar's `+`
   has no target when the sidebar is collapsed, and a missing target today
   renders nothing while the tour stays active.
3. **Platform split:** `App.vue:111` gates the in-app menu bar on `!isMac`. On
   macOS the menu is the OS's and is NOT in the DOM, so it cannot be ringed —
   copy-only there, real coach mark elsewhere. Windows path is unverifiable from
   a Mac.

---

## User feedback, in order

| #      | feedback                                                                                  | status                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1      | Opt out of onboarding at any point                                                        | done — Escape + Skip tips, both final                                                                                    |
| 2      | Quick look-up is crucial, show tools + snippets are reachable                             | done as step 3 (describes + names the chord)                                                                             |
| 3      | Demo tab + demo snippet + ship demo JSON files                                            | done — `src/main/demoFiles.js`, contents not paths                                                                       |
| 4      | Gap between launches is too long; ask before run two                                      | done — "Three more tips?" dialog fires the moment run one ends                                                           |
| 5      | Revisit onboarding any time                                                               | done — Help ▸ Show Tour · Settings ▸ Show tour · palette                                                                 |
| 6      | 4 + 3 split, not 7 in a row                                                               | done                                                                                                                     |
| 7      | Ring's top border looked thicker                                                          | done — the active tab's underline is the same 2px `--accent`; ring now hugs inside the target's box                      |
| 8      | White artifact near buttons on light themes only                                          | done — square hole vs rounded target left un-veiled corner slivers; tint is now one clipped layer                        |
| 9      | Dark rim after that fix                                                                   | done — scrim-over-scrim double-darkened to ~75%; tint and blur are now separate layers                                   |
| 10     | Step 6 should show drop works on the whole diff pane, not the file input                  | done — zone step, dashed ring                                                                                            |
| 11     | Show tips/tour in Settings should close the Settings dialog                               | done                                                                                                                     |
| 12     | Callout misaligned with the highlighted control                                           | done — dialog-targeted steps place above; callout was straddling the dialog edge                                         |
| 13     | Tooltip still misaligned                                                                  | done — the **beak** was pinned 24px from the card's edge; now tracks the target's centre (measured 2px off)              |
| 14     | Step 3 opened Quick look-up "for no reason"                                               | done — auto-peek removed; it stole focus so its own explanation sat behind it                                            |
| 15     | After step 1, show the diff unblurred before moving on                                    | done — 1.8s reveal beat on Next                                                                                          |
| 16     | Show tour must be disabled while a tour is running                                        | done                                                                                                                     |
| 17     | Don't overwhelm — quick orientation, make them independent fast                           | guiding principle; drove removing the "now you try it" gate                                                              |
| **18** | **Step 4: show menu items one by one, starting with how to reach Settings**               | **OPEN**                                                                                                                 |
| **19** | **Step 5: guide to finding it in the sidebar and creating it, not an abrupt window**      | **OPEN**                                                                                                                 |
| **20** | **Step 3: type into the search, filter the sidebar live, sidebar inert while it happens** | **OPEN** — needs a new `inert` step flag: hole is cut (sharp, visible) but pointer-blocked. Today a hole is always live. |

---

## Open bugs from review (fix O3 first — the redesign depends on it)

- **O1 — the tour never starts if "reopen last session" is off.**
  `useTourCommands` gates `begin()` on `tabs.sessionReady`; `tabsStore.js:362`
  returns before setting it when the setting is off. Silent, every launch.
  (That gate exists because starting on mount raced `restoreSession()`, which
  overwrote step 1's demo comparison — don't just remove it.)
- **O2 — step 5 rings a permanently disabled Save.** `startNewSnippetFrom`
  leaves the name blank → `can-save` false. The name field is outside the hole,
  so it can't be reached. Fix by seeding a name (feedback 19 supersedes this
  step anyway).
- **O3 — a missing target wedges the tour.** `TourOverlay.vue` renders on
  `active && step && found`; when `querySelector` misses, nothing renders while
  `active` stays true — no callout, no Next, no Skip. Triggers: collapsed
  sidebar, paste mode.
- **O4 — the demo comparison is never cleaned up.** On a cold profile it lands
  in the user's only tab marked unsaved, persists into the session, and prompts
  about unsaved work they never created.

Lower: run one leaves Settings open under run two (only `replay()` closes it);
the snippet editor can't be closed mid-tour (Cancel outside the hole, Escape
ends the tour); `commands.test.js:74` registry assertion is vacuous —
`flattenCommands` emits no `action`, so `missing` is always `[]`;
`useSpotlight`'s rAF loop runs for the app's lifetime, ungated on `active`;
`types.js` lacks the `TourStep`/`TourState` typedefs its JSDoc references;
`vitest.config.mjs` doesn't cover `src/main/demoFiles.js`.

---

## Constraints learned the hard way — don't re-litigate

- **`file:read` refuses any path under userData** (`files.js:214-217`) — that is
  the arbitrary-file-read guard. Demo files therefore return **contents**, never
  a path. Note the comment trap: it's userData, not `getDataDir()`, and the two
  diverge once a user relocates their data directory.
- **The Quick look-up launcher is a separate `BrowserWindow`** — the main
  window's overlay can neither ring it nor be seen behind it.
- **The veil is two layers by necessity:** tint = one clipped element (evenodd);
  blur = four rectangles, because Chromium resolves `backdrop-filter` **before**
  `clip-path` and a clipped blur layer blurs through its own hole.
- **Blur, not just scrim:** a black scrim moves a dark ground 1.00–1.17×
  (beacon is `#000000`). Measured across all 14 in `plan.md`.
- **Callout is `--bg-elevated` + `--btn-edge`** — the pair swaps roles by ground.
  `--bg-raised` + `--border` failed on 11 of 14.
- **`settingsStore.js` is pinned at exactly 308 lines** by `legacySize.mjs`;
  tour state lives in the slice's own persisted `onboarding` key.
- **Format touched files only** — `npx prettier --write <files>`. A directory-wide
  run reformatted 7 untouched files and failed the size ratchet.

## Still unfinished from the plan

`/validate` never ran (plan step 20). `docs/brand/roadmap.svg` still shows
Onboarding as an open track (`roadmap.md` is updated). Screenshots not
regenerated — `recapture-screenshots.mjs` now disables tips and throws if `.tour`
is on screen, but `make screenshots` needs the container.
