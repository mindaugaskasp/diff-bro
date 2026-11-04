# Onboarding by doing: tours, daily tips, and a regrouped Settings

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 9 / 35 steps |
| **Branch** | stack of six, `improvement/settings-groups` → `feat/daily-tips` (see Delivery) |
| **Started** | 2026-11-03 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-11-03T17:52:43Z |
| **Claude tokens used** | not measured |

Issues: #114 (onboarding, tours, tips), #214 (Settings groups), #215 (inline Languages row), #219 (per-language stop-after time, in the same row).
Every decision below was asked and answered on those issues on 2026-11-03.

## Problem

- **The tour shows instead of teaching.**
  - The tour is 8 cards you read and press Next on, over a dimmed window (`src/renderer/src/utils/tourSteps.js:20-91`).
  - A step's cut-out is blocked unless it is marked `live` (`tourSteps.js:17-19`), and only one step is.
  - Nothing has to be done for a step to pass, so nothing sticks.
- **It covers too much, and has one version.**
  - One list gated by `TOUR_VERSION = '0.5.0'` (`tourSteps.js:16`), so a release cannot introduce its own feature.
  - It cannot be replayed except as the whole thing (Settings ▸ Appearance ▸ Show tour, `SettingsDialog.vue:89-108`).
- **The way in is buried.** Show tour and "Show tips after an update" sit at the very bottom of Appearance, under the 20-theme grid, so they take a scroll to reach.
- **Settings is a flat grab bag.**
  - Nine tabs (ten on Windows, `SettingsDialog.vue:28-36`) at one level: Limits and Logs sit beside Appearance, and Fun is a whole tab for one switch.
  - Appearance mixes the theme, language, editor font and a Behaviour block.
- **The Languages row hides its main control** (#215).
  - The typed path, the found-programs menu, Browse… and Find again only appear after pressing Change… (`features/runner/components/LanguageRow.vue`, `ProgramPicker.vue`).
  - The row also says *Off* where the unticked box already does.
- **Non-obvious features are never taught.**
  - `#tag` search, snippet colours, `{{today}}` in a name, the quick look-up's tools row and Mermaid repair are all invisible until someone reads the docs.

## Solution

1. **Tours you do, not read.** Each step names one action, rings the control it needs, and moves on only when the user performs that action.
   - Coach marks never dim or block the window.
   - There is no Next and no Back. Only a click on **Skip** ends a tour; Escape never does.
   - A tour is data: `{ id, introducedIn, steps }`. Its seen state is kept per tour id.
2. **Three tours in v1:**
   - **Core**, offered inline on a fresh install's empty start screen: drag two sample files in, Save, find it by typing.
   - **Snippets**: +, a `{{blank}}`, name and Save, Copy and fill.
   - **Diagrams**: open the example, Compare with…, drag the shipped v2 example onto the right side.
3. **Releases introduce themselves.** A release that ships a tour offers it once, in a quiet card. A fresh install never sees release tours, and existing users get nothing new on this update.
4. **Daily tips.**
   - One "Did you know?" card, top right, the first time the window comes to the front on a new calendar day.
   - Five hand-picked tips to start.
   - **Knew this already** drops a tip, and **Don't show tips again** turns tips off.
5. **Settings regrouped into collapsible groups:**
   - **General:** Appearance, Behaviour, Tours, Shortcuts, plus Desktop on Windows.
   - **Integrations:** Languages, Claude, Terminal, Email.
   - **Data:** Storage, Limits, Logs.
   - A **Tours** page lists every tour and holds the tour and tip switches.
6. **Languages row inline:** checkbox, the program's path as an editable field with its version and a found-programs chevron, then Browse…. There is no Off label and no Change….

| option | why not |
|---|---|
| B: a "Get started" checklist that ticks itself | still something to read; nothing teaches until the user chooses to act (maintainer picked A) |
| C: no tour, one just-in-time hint per feature | never gets the core loop done in the first minute; dropped as the approach |
| Keep the "Take a one-minute tour?" dialog | a pop-up over the app on first launch; the inline offer on the empty start screen is the invitation |
| Step 3 presses the Quick Look shortcut for real | a second window steals focus and hides its own explanation (`tourSteps.js:51-55`); in-window search is reliable |
| A Share tour in v1 | cannot be done alone without a second person's key; out until a sample contact exists |
| Tips that skip features already in use | over-engineering; tips are a short hand-picked list, and Knew this already is the only exclusion |
| Tips by a set time, or on startup only | the app lives in the tray for days; first focus on a new date covers both |
| Settings as a grouped flat list, or three tabs with sub-tabs | maintainer picked collapsible submenus |
| Languages ▸ PHP / Python as their own pages | a third level for a page of one row |

## Scope

**In:**
- The tour engine and three tours:
  - registry, per-tour seen state and coach mark component
  - action-driven step advance, with the logic in composables
  - the sample-file chips
  - the shipped *Example — Mermaid diagram, v2* snippet
- The release-tour offer and its Settings switch.
- Daily tips: registry, schedule, card, Show me, Knew this already, Don't show tips again, and their Settings controls.
- Settings regrouped into collapsible groups, with Behaviour split from Appearance, Fun folded into Appearance and the Tours page added (#214).
- The inline Languages row (#215), with a per-language *Stop after* time in minutes (#219).
- Removing the old tour: the 8 steps, `TourConsentDialog`, `TOUR_VERSION`, `tourStep`/`seenVersion`/`tourDeferred` state and the demo stage. Old state is dropped, not migrated (#113).

**Out:**
- A Share tour (needs a sample contact).
- Any tour for a release before this one.
- Tip skip-if-used logic.
- A shortcut or menu item that starts a tour.
- Changing what any setting does.
- Running a real Quick Look window from a tour.

## Design

**Source of truth:** https://claude.ai/artifact/4qKCazmxt5eUeDRRpcZhP3. It is iterated there; this section is pasted from it.
**Approved design:** the canvas page **Approved design**, signed off by the maintainer on 2026-11-03 (#114). Every board is the real app driven by script, with only the new pieces drawn onto the live DOM using the app's tokens.

| artboard | shows |
|---|---|
| Core 1 of 3 (+ dark) | empty start screen; *Try it · 1 of 3*, two draggable chips `config-v1.json` / `config-v2.json`, *Load them for me · Skip* |
| Core 2 of 3 (+ dark) | the sample comparison open; Save ringed; coach mark *Keep this comparison* |
| Core 3 of 3 | sidebar search ringed, `chec` typed and narrowing to the saved diff; coach mark names the Quick Look shortcut in text |
| Core done | bottom-right card *That's the core: compare, keep, find.*, chips Snippets / Diagrams, *Every tour is in Settings ▸ Tours.* |
| Snippets 1–4 (+ dark 3, 4) | + ringed → empty editor with the blank hint and *Use a sample* → name field and Save ringed → Copy ringed → the real Fill in dialog with *Copy filled* |
| Diagrams 1–3, done (+ dark) | example row ringed → Compare with… ringed → v2 row ringed and the right pane dashed → the real diagram comparison with a closing card |
| Settings ▸ General ▸ Tours (+ dark) | collapsible groups; three tour rows (Start / Replay, Done); *Offer new tours after an update*; *Show a tip each day*; *Bring back tips I said I knew* |
| Settings ▸ Integrations ▸ Languages (+ dark) | Python on with `/usr/bin/python3 · 3.11.2` in the field; PHP off, greyed, *Found when you turn it on*; Browse… |
| After an update | bottom-right card *New in 0.16.0 · Run a snippet*, Later / Show me · 2 steps |
| Daily tip (+ dark), Show me | top-right card *Did you know?*, title, body, *Don't show tips again*, *Knew this already*, *Show me*, ×; Show me rings the search box with a one-line note |

Layout rules and tokens:
- **Coach mark:**
  - `--bg-raised` face with a 1px `--accent` keyline, `--radius-lg` and `--shadow-2`, 300px wide.
  - A pointer that matches the side it points from.
  - Label `--font-xs` at weight 500 in `--text-meta`; title at weight 600; body `--font-md`.
- **Target ring:** 2px `--accent`, `--radius`, plus a 5px `color-mix(--accent 22%, transparent)` halo. Pointer events pass through.
- **Cards** (done card, release card, daily tip): `--bg-raised`, `--radius-lg`, `--shadow-3`, 340–390px.
  - The release card sits 16px from the bottom right; the daily tip sits top right, below the toolbar band.
  - Actions use `.btn .btn-sm`, with `.btn-primary` for Show me and `.btn-ghost` for Later / Knew this already.
- **Sample chips:** `--bg-raised`, `--border`, `--radius`, `--shadow-2`, 34px high, file glyph `--glyph-diff`.
- **Settings nav:**
  - Group rows are `.nav-item` with a chevron `<AppIcon>` and the same height.
  - Child items are indented 22px at `--control-h-sm`; the open group shows its children.
- **Languages field:**
  - `--field-face` / `--field-edge`, `--control-h-sm`, `--font-mono` path, version in `--text-meta`, chevron `<AppIcon>`.
  - When off, the field is dimmed by the same rule as the current off path (`--text-meta` ink), not by opacity, which breaks the 4.5 floor.
- **Icons:** the bulb, sparkle, file and chevron glyphs are new `icons.js` entries, never Unicode.

### Theme verdict — all 20

Measured off the live app in each theme (computed `--accent`, `--bg`, `--bg-raised`, `--text`). The new pieces depend on two pairs: the accent keyline and ring against the raised face and the ground (a UI component, so 3:1), and body text on the raised face (4.5:1). `--text-meta` on cards is held to 4.5 by the theme sweep in the build; the probe here could not resolve it reliably.

| theme | ground | accent/raised | accent/bg | text/raised | verdict | note |
|---|---|---:|---:|---:|---|---|
| light | light | 5.18 | 5.18 | 18.42 | pass | floating-canvas inversion; cards are white |
| dark | dark | 4.62 | 5.05 | 14.64 | pass | |
| solar | light | 4.07 | 4.45 | 12.18 | pass | |
| neon | dark | 9.79 | 10.74 | 15.68 | check | accent `#22d3ee`; the 22% halo may glow; sweep the ring |
| nord | dark | 5.03 | 6.24 | 8.73 | pass | |
| sepia | light | 3.81 | 4.35 | 8.55 | pass | lowest keyline, above 3:1 |
| dim | dark | 7.23 | 7.79 | 12.99 | pass | |
| beacon | dark | 9.81 | 10.47 | 19.68 | pass | hard-keyline theme: cards keep `--dialog-edge` |
| meridian | light | 3.99 | 4.19 | 11.64 | pass | |
| linen | light | 5.65 | 6.38 | 13.57 | pass | |
| bloom | light | 4.34 | 4.95 | 12.80 | pass | |
| nyan | dark | 5.45 | 5.92 | 15.04 | check | accent `#ff2ecb`; halo glow; sweep the ring |
| matrix | dark | 13.92 | 14.68 | 16.87 | check | accent `#00ff41`; halo glow; sweep the ring |
| contrast | light | 7.63 | 8.54 | 18.76 | pass | hard keyline `#111111`: cards keep `--dialog-edge` |
| volcano | dark | 6.50 | 6.83 | 19.98 | pass | keyline theme for dialogs: cards keep `--dialog-edge` |
| amber | dark | 10.20 | 10.77 | 12.25 | pass | |
| tide | dark | 8.69 | 9.86 | 13.51 | pass | |
| ember | dark | 8.64 | 9.54 | 13.99 | pass | |
| graphite | dark | 11.12 | 12.21 | 14.08 | pass | |
| vector | light | 6.36 | 7.21 | 15.75 | pass | |

The halo is the only open risk. If the sweep shows it reading as a glow on neon, nyan or matrix, the halo drops to the keyline alone on those three. Each new surface is added to `SURFACES` in `scripts/theme-sweep.mjs`.

## Security rules touched

- **Rule 1 (offline):** untouched.
  - Tours, tips and samples ship in the app, and nothing is fetched.
  - The sample comparison uses the existing `demo:files` IPC (`src/main/demoFiles.js`), which returns contents, never paths.
- **Rule 3 (renderer/main split):** untouched.
  - The sample-file chips are an in-app drag carrying an app-defined type, not OS files, so no path is involved.
  - The daily-tip schedule reads `window` focus and `visibilitychange` in the renderer, with no new IPC.
  - Seen state persists through the existing onboarding store (`onboardingPersist.js`).
- **Rule 7 (sandbox exits):** untouched. No `openExternal` and no path is handed to the OS.
- **The Languages row (#215)** changes layout only. The three ways a program reaches main from #212 are unchanged:
  - an index into main's found list
  - main's own Browse… dialog
  - a typed path that main checks and confirms natively
  Rule 7's wording already covers it.
- **Stop after (#219)** adds one IPC handler, `run:setStopAfter`. The renderer sends a language and a number, main refuses anything but whole minutes from 0 to 1440, and the value lives in main-only `runners.json`. 0 arms no timer; Stop, tab close and quit still end the run, and the 1 MB output cap stays.
- **Rule 8 (no injection sinks):** tip and tour copy comes from the catalogue through `<i18n-t>` and interpolation; no `v-html`.
- **No new dependency.**

## Test plan

- **unit:**
  - `tests/renderer/features/onboarding/tourRegistry.test.js`: every tour has an id, an `introducedIn` and steps with an `advanceOn` event; ids are unique; copy keys exist.
  - `tests/renderer/features/onboarding/tourPlan.test.js`:
    - a fresh install offers the core tour inline only, and no release tours
    - an existing profile (old `onboarding.json` or any saved entry) gets no offer
    - a release card appears once, only when that release ships a tour, and merges across skipped versions
    - Later keeps the tour marked New
    - the switch off means no card
  - `tests/renderer/composables/useTourStep.test.js`:
    - a step advances only on its event
    - saving another comparison does not advance step 2
    - closing the sample tab ends the tour as skipped
    - Escape never ends a tour
    - a coach mark hides while its target is off screen and returns
  - `tests/renderer/features/onboarding/tipSchedule.test.js`:
    - first focus on a new local date shows one tip
    - a second focus the same day shows none
    - waits while a dialog or tour is open
    - × hides until tomorrow
    - Knew this already removes the tip for good
    - Don't show tips again turns tips off
    - Bring back resets the known list
    - the order is fixed
  - `tests/renderer/utils/settingsNav.test.js`:
    - the group tree holds every page once
    - Desktop is present only on Windows
    - opening a page opens its group
  - `tests/renderer/features/runner/LanguageRow.test.js` (mount) and runner store: the inline field shows the path and version; Enter sends `usePath`; the chevron lists candidates plus Find again; off greys the field and Browse….
- **e2e:**
  - `e2e/onboarding-core.spec.mjs`, on a fresh profile:
    - the inline offer is shown; dragging the chips opens the sample comparison
    - Save advances; the saved diff is tagged `example`
    - typing in search finishes the tour
    - a relaunch shows no offer
    - an existing profile sees no offer
  - `e2e/onboarding-snippets.spec.mjs`: + → paste a `{{service}}` line → name and Save → Copy → fill → Copy filled ends it; the clipboard holds the filled text.
  - `e2e/onboarding-diagrams.spec.mjs`: the v2 example exists; open → Compare with… → drop v2 on the right side → the diagram comparison shows; the tour ends.
  - `e2e/tours-settings.spec.mjs`: General ▸ Tours lists three tours; Replay starts one; the switches persist across a relaunch.
  - `e2e/daily-tip.spec.mjs` (clock faked through the app's date seam): a tip on first focus, none the same day, a new one next day; Knew this already, Don't show tips again, Show me rings the control.
  - `e2e/settings-groups.spec.mjs`: groups fold and unfold; every old tab's content is reachable; Fun's switch lives in Appearance.
  - `e2e/runner-settings*.spec.mjs` updated for the inline row (#215).
  - The old `e2e/onboarding-tour.spec.mjs` and `e2e/tour-consent.spec.mjs` are deleted with the old tour.
- **red → green:** each behaviour's test is written first and watched failing against the slice's base; the failure is recorded in the slice's PR.
- **seed fixtures:** no change to `scripts/seed-local.mjs`, since no new file format. The v2 Mermaid example is a seeded snippet (`snippetStore.seedExamples`), not a file.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | yes | the onboarding line becomes tours you do, the Tours page, and daily tips |
| `docs/screenshots/*.png` | yes | `empty-state` gains the inline sample offer on a fresh profile. Check the others in the container, since Settings is not in the README set |
| `docs/roadmap.md` | yes | onboarding moves open → done |
| `docs/brand/roadmap.svg` | yes | the same move |
| `docs/*.md` | yes | `features.md` describes tours, tips, the Settings groups, the inline Languages row and the stop-after time; `security.md` states the per-language stop-after time in place of the fixed 30 s; `glossary.md` adds *tour*, *coach mark*, *daily tip*; `standards.md` gains no rule |

## Delivery

One PR per design change, stacked with git-spice. Slice 1 targets `main`, and each later slice targets the slice below it. Each PR is reviewed alone and is green on its own. The stack merges bottom-up and is released as one tag.

| # | slice | branch | base | PR | status |
|---|---|---|---|---|---|
| 1 | Spec + Settings in collapsible groups (#214) | `improvement/settings-groups` | `main` | | committed |
| 2 | Languages row inline (#215) + stop-after minutes (#219) | `improvement/languages-row-inline` | slice 1 | | committed |
| 3 | Tour engine + core tour, old tour removed | `feat/tours-by-doing` | slice 2 | | |
| 4 | Snippets and Diagrams tours, v2 example | `feat/snippets-diagrams-tours` | slice 3 | | |
| 5 | Settings ▸ Tours page + the release-tour offer | `feat/tours-page` | slice 4 | | |
| 6 | Daily tips | `feat/daily-tips` | slice 5 | | |

Slice 1 keeps Show tour working under General ▸ Behaviour until slice 5 replaces it, so no slice leaves the tour unreachable.

## Implementation plan

**Slice 1: Settings groups (#214)**
- [x] 1. `utils/settingsNav.js`, the group tree (General, Integrations, Data), with tests first.
- [x] 2. `SettingsNav.vue`: collapsible group rows with an `<AppIcon>` chevron; the open group follows the active page.
- [x] 3. Split Behaviour out of `SettingsAppearance`, fold Fun's switch into Appearance, and move Languages and Claude to their own pages under Integrations.
- [x] 4. `e2e/settings-groups.spec.mjs`; update the existing settings specs for the new paths.
- [x] 5. Theme sweep surface `settings-nav`; `npm run check`.

**Slice 2: Languages row inline (#215)**
- [x] 6. Tests for the inline row first; remove the Off text and Change….
- [x] 7. The path field, with the version, Enter to use, the chevron menu (found plus Find again) and Browse…; greyed when off.
- [x] 8. *Stop after [2] min* per language (#219): an integer input, where 0 means no limit and 2 is the default. Main validates a non-negative integer and stores it in `runners.json`, and `startRun` takes `timeoutMs` from it, with no timer when it is 0. Unit tests for the validation and the core, plus an e2e that a 0-minute run outlives the old 30 s.
- [x] 9. Update `e2e/runner-settings*.spec.mjs`; sweep `settings-languages`; `docs/security.md` drops the fixed 30 s in favour of the per-language time.

**Slice 3: Tour engine + core tour**
- [ ] 10. `features/onboarding/tourRegistry.js` (`{ id, introducedIn, steps }`), plus `tourPlan.js` with fresh-install and existing-user detection; tests first.
- [ ] 11. `useTourStep.js`: advance on the step's event, hide and return with the target, closing the sample tab skips, Escape is ignored.
- [ ] 12. `CoachMark.vue` and `TargetRing.vue` with `styles/`; new icons in `icons.js`.
- [ ] 13. `SampleFileChips.vue` on `StartSurface` (fresh install, empty screen only), an in-app drag type, and *Load them for me*.
- [ ] 14. The core tour's three steps; the sample diff is saved tagged `example`; the sample tab is not restored or prompted on quit.
- [ ] 15. Delete the old tour: `tourSteps.js`, `tourCopy.js`, `TourOverlay`, `TourCallout`, `TourConsentDialog`, the demo stage in `tourDemo.js`, the old state keys and the `tour.*` and `onboarding.tourConsent.*` copy.
- [ ] 16. `e2e/onboarding-core.spec.mjs`; delete the old tour specs; sweep `coach-mark` and `start-sample-chips`.

**Slice 4: Snippets and Diagrams tours**
- [ ] 17. Seed *Example — Mermaid diagram, v2* in `seedExamples` (fresh installs only), with a test.
- [ ] 18. The Snippets tour: +, a `{{…}}` typed (the *Use a sample* line), name and Save, then Copy and Copy filled.
- [ ] 19. The Diagrams tour: open the example, Compare with…, drop v2 on the right side; the done card.
- [ ] 20. `e2e/onboarding-snippets.spec.mjs` and `e2e/onboarding-diagrams.spec.mjs`.

**Slice 5: Tours page + release offer**
- [ ] 21. `ToursSettings.vue` at General ▸ Tours: rows with Start / Replay, Done, and New.
- [ ] 22. *Offer new tours after an update* (on by default); remove Show tour and *Show tips after an update* from Behaviour.
- [ ] 23. `ReleaseTourCard.vue`: shown once, merged across skipped versions; Later keeps it New; never on a fresh install. Tests first.
- [ ] 24. `e2e/tours-settings.spec.mjs`; sweep `tours-page` and `release-card`.

**Slice 6: Daily tips**
- [ ] 25. `features/onboarding/tips.js`: the five tips in order (hash-scope-search, snippet-colour, name-placeholders, quick-look-tools, mermaid-repair), each with copy keys and a Show me target.
- [ ] 26. `tipSchedule.js`: first focus on a new local date, waiting while a dialog or tour is open, ×, Knew this already, off and reset. A date seam for tests.
- [ ] 27. `DailyTipCard.vue` at the top right; Show me reuses `TargetRing`; any click dismisses it.
- [ ] 28. *Show a tip each day* and *Bring back tips I said I knew* on the Tours page.
- [ ] 29. Remove `PlaceholderTip.vue`, its `placeholderTip` copy and its dismissed state, and the e2e that covers it.
- [ ] 30. `e2e/daily-tip.spec.mjs`; sweep `daily-tip`.

**Across the stack**
- [ ] 31. i18n: every new string in `en.json`; regenerate `en-XA`; check `e2e/locale.spec.mjs` for clipping in the coach mark and cards.
- [ ] 32. Docs: `features.md`, `glossary.md`, `README.md`, `docs/roadmap.md` and `docs/brand/roadmap.svg`.
- [ ] 33. `make screenshots SHOTS="empty-state"` in the container, then look at the frame.
- [ ] 34. Full 20-theme sweep over all new surfaces.
- [ ] 35. `/validate`, then fill in Validation.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-11-03 | Approach A: tours done on sample content, with action-driven steps | the user learns by doing the core loop once | B checklist, C just-in-time hints |
| 2026-11-03 | No consent dialog; the offer is inline on the empty start screen and goes once skipped, finished, or two own files are compared | nothing pops over the app on first launch | keep `TourConsentDialog` |
| 2026-11-03 | Core step 3 is the in-window search; the coach mark names the Quick Look shortcut in text only | one window; no focus theft | pressing the shortcut for real |
| 2026-11-03 | The sample diff saved in step 2 stays, tagged `example` | step 3 needs it, and Quick Look has something real | delete it at the end |
| 2026-11-03 | Off script: coach marks hide and return; closing the sample tab ends quietly as skipped; only saving the sample advances step 2 | never block, never nag | pause and resume on the next launch |
| 2026-11-03 | v1 tours: core, Snippets, Diagrams; Share later | Share cannot be done alone | all three follow-on tours |
| 2026-11-03 | Release tours: offered only if the release ships one, never on a fresh install, once; Later keeps it New; skipped versions merge into one card | do not bombard new installs | a "what's new" card on every release |
| 2026-11-03 | Tours live on their own Settings page | the maintainer chose a tab of its own | inline in Appearance; a Tours… sheet |
| 2026-11-03 | Sample files really drag (one chip brings both, or one side at a time); *Load them for me* is the fallback | teaches the drop used for real files | click-only chips |
| 2026-11-03 | Coach marks: no Next, no Back, only clicking **Skip** ends a tour; Escape never does | a stray key press must not end a tour | Next for readers; Escape ends it |
| 2026-11-03 | Existing users see nothing new on update; the tours wait in Settings | they know the app | offer the new core tour once |
| 2026-11-03 | Diagrams tour has 3 steps with a shipped *Example — Mermaid diagram, v2* | teaches dropping a snippet to compare | a 2-step tour that drops v2 itself |
| 2026-11-03 | Snippets tour has 4 steps including `{{blanks}}`; step 3 is *Name it, then Save* (found while rendering: an unnamed snippet cannot be saved) | blanks are the non-obvious half of snippets | 3 steps without blanks |
| 2026-11-03 | Daily tips: top right, one tip, the first time the window comes to the front on a new date, waiting for dialogs and tours | the app lives in the tray | on startup only; a set time |
| 2026-11-03 | Tips cover only what is not obvious; a short hand-picked list; no skip-if-used logic | keep it simple | basics-first ordering; usage signals |
| 2026-11-03 | v1 tips, in order: hash-scope-search, snippet-colour, name-placeholders, quick-look-tools, mermaid-repair | the maintainer's picks from 23 candidates (#114) | the other 18 |
| 2026-11-03 | A release can add tips, at the front of the queue for that release | new features surface first | — |
| 2026-11-03 | The Tours page gains *Show a tip each day* and *Bring back tips I said I knew* | tips can be turned back on | — |
| 2026-11-03 | Settings: collapsible groups General / Integrations / Data; *Work with* renamed Integrations; Languages is one page with Python and PHP (#214) | the maintainer's picks | grouped flat list; sub-tabs; one page per language |
| 2026-11-03 | Languages row inline, with no Off label and no Change… (#215) | the unticked box already says off; the path is the main control | the picker behind Change… |
| 2026-11-03 | Design signed off on the canvas Approved design page | approval gate | — |
| 2026-11-03 | *Stop after* is an integer number of minutes per language: 0 is no limit, 2 is the default, and main validates and stores it (#219) | the maintainer's call; it rides in slice 2 because it changes the same row | a 5 s – 1 h range in seconds; no *no limit* |
| 2026-11-03 | Remove the editor's `PlaceholderTip` ("Did you know you can use {{…}}…") in slice 6 | the Snippets tour and the daily tips now teach blanks; two "Did you know" surfaces would compete | keep it |
| 2026-11-03 | Settings nav: one group open at a time; reopening the group that holds the active page keeps that page, while another group opens on its first page | the state never jumps away from where you are | open several at once |
| 2026-11-03 | An unknown page id (for example an old `fun` or `integrations`) falls back to Appearance; no aliases | only `cli` is passed anywhere; no backward compatibility (#113) | an alias map |
| 2026-11-03 | The rotation switch moved into Appearance as a `SettingToggle`, and its hint now reads "the theme you picked above" | it now sits inside Appearance and matches the other switches | the old raw checkbox row |
| 2026-11-03 | The nav rail is 152px (was 128); labels are one line with an ellipsis | indented children and the `en-XA` group names fit at a fixed control height | wrapping labels |
| 2026-11-03 | Nav ink: group rows `--text` at weight 500, pages `--text-meta` at 400, the active page at weight 600 on `--btn-face`, hover `--btn-face-hover` | the old `--text-dim` / `--bg-hover` failed the sweep (4.5:1 on solar, nord, sepia and bloom; the 1.15 hover step on 13 themes) | keep the old ink |
| 2026-11-03 | Group rows carry `aria-expanded` and the active page `aria-current="page"` | the state is readable and testable | — |
| 2026-11-03 | *Stop after* is capped at 1440 minutes (a day); main refuses more, and a hand-edited value falls back to 2 | past 2^31 ms `setTimeout` fires at once, so a huge number would kill a run immediately; 0 already gives no limit | no cap; the 35 791-minute `setTimeout` ceiling |
| 2026-11-03 | The chevron is shown only when its menu has something in it: found programs, or Find again while on | an off language with nothing found would open an empty menu | always show it |
| 2026-11-03 | The field keeps what was typed until main adopts a program; the version shows only while the field holds the program it belongs to; Enter on the program already in use sends nothing | a refused path stays to correct, and a stale version never sits beside another path | revert on blur |
| 2026-11-03 | The *Stop after* input sits on a second line under the field; a value main would refuse is put back, not sent; "0 for no limit" is its tooltip | one row stays one line wide; the renderer never sends what main refuses | a separate column; a "no limit" checkbox |
| 2026-11-03 | The pane's timeout note reads "stopped after {n} min", with the minutes main answered to Run | the limit is per language now, so a fixed "30 seconds" would be wrong | derive minutes from the run's ms |
| 2026-11-03 | `ProgramPicker.vue` is replaced by `ProgramMenu.vue` (the chevron's menu); `runner.settings.off`, `change` and `use` are removed | the picker's three controls fold into the row | keep the picker behind the chevron |
| 2026-11-03 | The 0-minute e2e speeds up main's long timers (≥10 s run 1000× faster) instead of adding a test seam to `runnerCore` | the real `startRun` timer path is what is proven, with no test-only code shipped | a `timeoutMs` override through IPC or env |

## Validation

Recorded as fact, not intention.

- [ ] `/validate`: summary below, full report in `quality-audit.md`
- [ ] `npm run check`: paste the real result
- [ ] UI seen running (Docker / `make e2e`)
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `make local-seed`: no new format, so not needed
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category | tokens |
|---|---:|
| input | |
| output | |
| cache write | |
| cache read | |
| **total** | |

**Outcome:**
