# Finding the row you just made — new-row highlight

|                                         |                                 |
| --------------------------------------- | ------------------------------- |
| **Status**                              | shipped                         |
| **Progress**                            | 13 / 13 steps                   |
| **Branch**                              | `improvement/new-row-highlight` |
| **Started**                             | 2026-08-07                      |
| **Finished**                            | 2026-08-07                      |
| **Bugs found and fixed this iteration** | 2 / 2                           |
| **Token baseline**                      | 2026-08-06T21:38:24Z            |
| **Claude tokens used**                  | 35,531,836 (processed)          |

Source: interaction proposal artifact `89f60c6d-5b7f-4b12-bea0-57407222cf38`
("Finding the row you just made"). Its per-theme numbers were **re-derived from
`themes.css` for this plan** rather than copied; where the two disagree, the
values below are the ones parsed here.

## Problem

Saving a snippet or a diff inserts a row that nothing marks, into a list that is
usually not showing its insertion point.

- Both lists are newest-first _below the favourites_, not at the top of the
  panel: `snippetStore.js:219-220` sorts `favorites` and `listed` separately and
  `SnippetsPanel.vue:38-41` concatenates them, so a new snippet lands **after
  every starred row**. `SavedDiffsSection.vue:34-36` does the same with
  `vault.favoritesOwn` + `vault.ownActive`.
- The sidebar is one scroll over four sections (`SavedDiffs.vue:184-195`). With
  the panel scrolled, the insertion point is off-screen above.
- A section can be collapsed (`SnippetsPanel.vue:24`, `SavedDiffsSection.vue:31`
  — `v-show`), so the row is added into hidden markup.
- A tag or search filter can exclude the new row outright
  (`SnippetsPanel.vue:36-41`), and today that is silent.

The only feedback is that a list you were not looking at got one row longer.

There is already a "just added" idiom in the repo —
`features/share/components/styles/TrustedKeyRow.css:14` (`.key.added`, an accent
wash at 14% with a one-shot flash) — and transplanting it is the obvious move.
The sweep below is why it does not survive the move.

## Solution

**A composite of four channels on one event**, because no single channel clears
all 14 palettes:

1. **insertion** — the row animates in (opacity + 6px lift, 320ms). Layout
   motion cannot fail a contrast check.
2. **wash** — a transient accent tint that peaks at **26%** (the sepia minimum)
   and decays to **nothing** over 1.4s, so it never becomes a second permanent
   row state.
3. **rail** — a 3px `--accent` bar down the row's **right** edge that wipes in,
   blinks once, and stays. The left edge is taken: `SnippetRow.css:19-22` puts
   `inset 3px 0 0 var(--pin-ink)` there for a favourite, so the two states stack
   instead of fighting.
4. **badge** — a `NEW` keyline chip. Says it in words, so it survives greyscale,
   colour-blindness, and the dim/matrix hue collision below.

Plus the half that is behaviour rather than CSS: **reveal** (expand the section,
`scrollIntoView({ block: 'nearest' })`) and **retire** (first interaction with
the row, the next create, or 60s — whichever comes first).

| option                                                    | why not                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reuse `.key.added` — persistent 14% accent wash           | Its resting tint reads as `--bg-hover`, not as a state. See the numbers below: no single percentage separates from hover on all 14, and the range needed is 12% → 26%.                                       |
| Wash only, at each theme's own minimum                    | A per-theme magic number is exactly the "hardcoded colour" the standards forbid, and it would still collide with the favourite tint on dim/matrix.                                                           |
| 2px inset accent ring ("ring settle")                     | On a ~30px row a full ring reads as **selection**, and a dashed accent outline is already the drop-target idiom (`SectionHeader`). Held in reserve if the rail is too quiet.                                 |
| Insertion sweep (gradient band across the row)            | Leaves nothing behind — look away for two seconds and the evidence is gone. Its insertion half is kept as channel 1; the gradient band competes with the rail for the same 900ms.                            |
| Accent as the badge **label**                             | Fails the 4.5:1 reading floor on five themes (solar 3.21, meridian 3.70, sepia 3.81, bloom 4.34, light 4.49). Label is `--text`; the accent goes on the keyline.                                             |
| Filled badge (`--bg` / `--bg-raised` chip)                | `--bg-raised` resolves to `var(--bg)` and the row's ground is `--bg-panel`, so the fill does not lift. The keyline carries it.                                                                               |
| `TransitionGroup` on both lists for the insertion channel | Not needed: the row animating **itself** on mount is the insertion cue. A `TransitionGroup` would only animate the _other_ rows sliding down, and both `<ul>`s carry a non-keyed empty-state `<li>` sibling. |
| A toast/notice on every create                            | The question is _where did it land_, which a toast cannot answer.                                                                                                                                            |

## Scope

**In:**

- `.is-new` + `.new-badge` in `styles/ui.css` (two components need them).
- ~~`lastCreatedId` on `snippetStore` and `vaultStore`~~ → **as built:**
  `lastCreatedRowId` + `markNewRow` / `clearNewRow` on the core `uiStore`, one
  key for both collections, plus a `marks` opt-out on `snippetStore.add()` and
  `vaultStore._add()` so seeding, importing and restoring do not mark. See
  Decisions.
- `composables/useNewRowMarker.js` — the retire rule and the reveal.
- `SnippetRow.vue`, `SavedDiffRow.vue`, `SnippetsPanel.vue`,
  `SavedDiffsSection.vue`, `ExternalDiffsSection.vue` wiring.
- The badge word in `shared/i18n/en.json` + regenerated `en-XA.json`; a notice
  string for the filtered-out case.
- `e2e/new-row-marker.spec.mjs`; unit tests for the two stores and the composable.
- A `new-row` surface in `scripts/theme-sweep.mjs`, and the one change that
  makes an accent **keyline** gateable there (see Decisions).

**Out:**

- Tools rows (`features/tools`) — a pinned tool is not _created_, so there is no
  arrival event.
- The quick look-up window's result list — it is a search result, not a list you
  just inserted into.
- Clearing the user's filter automatically. The filtered-out case gets a notice,
  not a hijacked filter (recorded in Decisions).
- The "ring settle" fallback (candidate C). Held in reserve, not built.

## Design

Token-driven throughout: `--accent`, `--text`, `--bg-panel` (the row's ground),
`--chip-h`, `--font-2xs`, `--radius-pill`, `--space-2`, `--pin-ink` (untouched,
on the left edge). No literal colour, font-size or radius, and **no blur** —
`--shadow-*` is not reached for, because an accent glow blooms on the
high-chroma themes and is a meaningless grey smudge on the light grounds.

### Theme verdict — all 14

Parsed from `styles/themes.css` (+ `tokens.css` for `--pin-ink`, which is
`color-mix(in srgb, var(--favorite) 70%, var(--text))`). Ground is `--bg`.

- **edge** = `--accent` on `--bg-panel`, WCAG. Floor **3.0** (non-text mark).
- **label** = `--text` on `--bg-panel`. Floor **4.5** (the badge word).
- **wash%** = the accent percentage at which a washed row differs from a
  **hovered** row by at least that theme's own hover step (OKLab). This column is
  the argument against a persistent wash.
- **ΔE acc/fav** = OKLab distance between `--accent` and `--favorite` — how far
  "new" is from "pinned" on hue alone.
- **text@26%** = `--text` read over the wash at its peak. Floor **4.5**.

| theme    | ground | edge      | label | wash%   | ΔE acc/fav | text@26% | verdict | note                                                             |
| -------- | ------ | --------- | ----- | ------- | ---------- | -------- | ------- | ---------------------------------------------------------------- |
| light    | light  | 4.49      | 15.99 | none≤60 | 0.157      | 11.06    | pass    | floating-canvas inversion; accent-as-label would fail            |
| dark     | dark   | 4.62      | 14.64 | 17      | 0.349      | 10.36    | pass    |                                                                  |
| solar    | light  | **3.21**  | 12.18 | 19      | 0.111      | 9.01     | pass    | weakest edge of the 14 — still over the 3.0 floor                |
| neon     | dark   | 9.79      | 15.68 | 17      | 0.273      | 8.73     | pass    | accent `#22d3ee` — hard edge only, no glow                       |
| nord     | dark   | 5.03      | 8.73  | 17      | 0.161      | **5.43** | pass    | tightest text-over-wash of the 14                                |
| sepia    | light  | 3.81      | 8.55  | **26**  | 0.105      | 6.27     | pass    | sets the wash peak: the worst case is the number that ships      |
| dim      | dark   | 7.23      | 12.99 | **12**  | **0.044**  | 7.72     | pass    | accent ≈ favourite gold — the badge is what separates the states |
| beacon   | dark   | 9.81      | 19.68 | 18      | 0.302      | 11.89    | pass    | hard keyline `#e0e0e0`; nothing here removes or softens a border |
| meridian | light  | 3.70      | 11.64 | 15      | 0.201      | 8.52     | pass    |                                                                  |
| linen    | light  | 5.65      | 13.57 | 13      | 0.239      | 9.38     | pass    |                                                                  |
| bloom    | light  | 4.34      | 12.80 | 16      | 0.184      | 9.08     | pass    |                                                                  |
| nyan     | dark   | 5.45      | 15.04 | 13      | 0.410      | 10.34    | pass    | accent `#ff2ecb` — hard edge only, no glow                       |
| matrix   | dark   | **13.92** | 16.87 | 14      | **0.044**  | 8.56     | pass    | accent `#00ff41`; same hue collision as dim                      |
| contrast | light  | 7.63      | 18.76 | 15      | 0.375      | 11.82    | pass    | hard keyline `#111111` — additive only, nothing softened         |

Reading the table: the **edge** column clears 3.0 on all 14 (min solar 3.21), the
**label** column clears 4.5 on all 14 (min sepia 8.55), and **text@26%** clears
4.5 on all 14 (min nord 5.43) — so the wash at its loudest never costs the row's
name. The **wash%** column spans 12 → 26 with `light` never separating at all,
which is why the wash is transient and not the identifying mark. The two **0.044**
cells are why words, not hue, carry the identification.

## Security rules touched

None. No IPC handler, no fs, no crypto, no new dependency, no `shell.openExternal`
call site, no `v-html`. `uiStore.lastCreatedRowId` is a renderer-only UUID that is
never persisted (`uiStore` has no `persist()`) and never crosses the preload
boundary. The badge word goes through the i18n catalogue and renders as Vue text
interpolation. The two extracted `utils/` modules moved existing logic verbatim
and stayed pure — no Vue, no stores, and neither calls `t()` (both take the
already-translated fallback name as an argument), which is what keeps the
locale from being frozen at module load.

## Test plan

Written before the code.

- **unit** — `tests/renderer/stores/snippetStore.test.js`: `add()` marks the row;
  a bulk `importFromFile()` leaves the mark `null` (marking the last of thirty
  imported rows is noise, not feedback); `clearNewRow(id)` clears only a
  matching id.
- **unit** — `tests/renderer/stores/vaultStore.test.js`: `save()` and
  `addShared()` mark; and the ONE-mark invariant — a snippet create after a diff
  save replaces the mark rather than leaving two rows lit in two sections.
- **unit** — `tests/renderer/composables/useNewRowMarker.test.js`: reveals a
  located row; opens a collapsed section first; retires after
  `NEW_ROW_TTL_MS`; retires when a second create replaces the id; reports the
  filtered-out case instead of revealing nothing; does nothing for an id that
  belongs to another section; clears its timer on scope dispose.
- **e2e** — `e2e/new-row-marker.spec.mjs`: create a snippet through the real
  editor, then assert the **measurable** things — the rail's bounding box sits on
  the row's right edge at 3px wide, its computed colour equals the resolved
  `--accent`, the badge is visible and its computed `border-color` is that same
  accent while its `color` is `--text`, and a **starred** new row still carries
  the left pin bar (`box-shadow`) _and_ the right rail. Then interact with the
  row and assert both marks are gone. Starring is deliberately NOT the retiring
  interaction — see Decisions — which is what makes the starred-and-new state
  reachable rather than merely defensive.
- **red → green** — every one of the above watched failing first; the e2e
  against the current build, the unit tests against the current stores.
- **seed fixtures** — none. No new file format and no changed data shape;
  `scripts/seed-local.mjs` is untouched.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                     |
| ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | no      | No architecture or feature-status change — this is feedback on an existing action, not a capability the README lists.                                                                                            |
| `docs/screenshots/*.png` | no      | The marker is transient and retires; none of the five captured states (`empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`) is captured mid-create, and the resting row is unchanged. |
| `docs/roadmap.md`        | no      | Not a roadmap track — no item moves open → done.                                                                                                                                                                 |
| `docs/brand/roadmap.svg` | no      | Same reason.                                                                                                                                                                                                     |
| `docs/*.md`              | no      | No security posture, IPC surface or glossary term changes. `standards.md` already carries every rule this leans on.                                                                                              |

## Implementation plan

- [x] 1. Branch `improvement/new-row-highlight`; record the token baseline.
- [x] 2. `e2e/new-row-marker.spec.mjs` — written, run, **watched fail** (all three
      on the absent `is-new` class), green after the build.
- [x] 3. Store unit tests (snippet + vault) — written, watched failing (9 red).
- [x] 4. `useNewRowMarker.test.js` — written, watched failing (module absent).
- [x] 5. `styles/ui.css`: `.is-new` (insertion + wash `::before` + rail `::after`)
      and `.new-badge`, with a `prefers-reduced-motion` block that parks all four
      animations and **keeps the rail and badge drawn**.
- [x] 6. **Amended.** `snippetStore` and `vaultStore` were both AT their
      `legacySize` cap, and the ratchet refused the growth — correctly, and it
      surfaced a real defect in the two-key design (see Decisions). The state
      became ONE key on the core: `uiStore.lastCreatedRowId` + `markNewRow` /
      `clearNewRow`.
- [x] 7. **Added by 6.** To make room at the right seam rather than game the
      ratchet, the pure logic came out of both stores:
      `utils/snippetState.js` (tag palette, tag arithmetic, legacy-shape
      migration) and `utils/vaultEntries.js` (entry coercion, `diffFormatTag`).
      Both stores re-export their public names, so no caller changed.
      snippetStore 575 → 483, vaultStore 408 → 364, and
      `check-structure.mjs --retighten` lowered both baselines.
      `check-theme-depth.mjs` reads the tag palette from source, so it was
      repointed at its new home.
- [x] 8. `composables/useNewRowMarker.js` — `locate(id)` → reveal / notice /
      ignore, the 60s timer, `onScopeDispose` cleanup.
- [x] 9. `SnippetRow.vue` + `SavedDiffRow.vue`: `.is-new` class,
      `data-new-row` hook, the badge element, `@pointerdown` → `clearNewRow` on
      the row's PRIMARY button only. Snippet badge takes the `.when` slot; the
      saved-diff badge sits after the lifetime chip (a diff's lifetime **is**
      information, a ten-second-old snippet's age is not).
- [x] 10. `SnippetsPanel.vue` / `SavedDiffsSection.vue` /
      `ExternalDiffsSection.vue`: install the marker, supply `locate` and the
      section-open callback.
- [x] 11. i18n: `newRow.badge` + `newRow.hiddenByFilter` in `en.json`;
      `en-XA.json` regenerated; `check:i18n` and `check:rawtext` green.
- [x] 12. `scripts/theme-sweep.mjs`: a `new-row` surface, and the probe-channel
      change that lets an accent keyline be gated rather than only reported.
- [x] 13. `make theme-sweep` run in the container across all 14 — 504
      measurements, zero under floor.

## Decisions

| date       | decision                                                                                          | why                                                                                                                                                                                                                                                                                                                                      | rejected                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-07 | Re-derive every per-theme number from `themes.css` instead of trusting the artifact               | The standards require parsed values. They agreed within rounding except `light`'s wash%, which never separates at any tint ≤60% — strengthening, not weakening, the case against a persistent wash.                                                                                                                                      | Copying the artifact's table                                                                                                  |
| 2026-08-07 | No `TransitionGroup`                                                                              | The row animating itself on mount **is** the insertion cue; a `TransitionGroup` only animates the neighbours, and both `<ul>`s hold a non-keyed empty-state `<li>`.                                                                                                                                                                      | The artifact's own note that insertion "needs a `TransitionGroup` on both lists"                                              |
| 2026-08-07 | A row filtered out gets a **notice**, not an auto-cleared filter                                  | Clearing a filter the user set is destructive and unasked-for. `diffStore.showNotice` is the existing 5s channel and says the true thing.                                                                                                                                                                                                | Auto-clearing search + tags; doing nothing (the current failure)                                                              |
| 2026-08-07 | Bulk import does not mark                                                                         | Marking the last of thirty imported rows is noise. `importFromFile` resets the key when it finishes.                                                                                                                                                                                                                                     | Marking the last import; marking all of them                                                                                  |
| 2026-08-07 | Add a third element to a `theme-sweep` probe tuple — the channel (`text` \| `border`)             | The sweep gates only `text` today, so the central claim of this design ("the accent edge clears 3:1 on all 14") would be _reported_ and never _enforced_. Six lines, and the rail is a pseudo-element the sweep cannot select at all, so the badge's keyline is the only way to hold it.                                                 | Leaving the keyline ungated; making the rail a real element purely to be measurable                                           |
| 2026-08-07 | Retire on `pointerdown`, not on hover                                                             | Hover fires while the pointer merely travels across the sidebar toward something else, which would retire a marker the user never looked at. (Refined below: `pointerdown` on the row's primary button, not anywhere on the row.)                                                                                                        | `mouseenter`; `click` alone (a right-click is still an interaction)                                                           |
| 2026-08-07 | Tools rows are out of scope                                                                       | A tool is pinned, never created — there is no arrival to mark.                                                                                                                                                                                                                                                                           | Applying `.is-new` to every `.row` in the sidebar                                                                             |
| 2026-08-07 | ONE marker key on `uiStore`, not one per store                                                    | The size ratchet refused the two-key version, and inspecting why exposed a real defect: with a key per collection, saving a diff and then adding a snippet leaves TWO rows lit in two sections. "The row you just made" is one row. `uiStore` is where the standards already put state many features raise and none owns.                | `lastCreatedId` on each store (mirroring `shareStore.lastAddedTrustedFp`, which is fine because that store is not at its cap) |
| 2026-08-07 | Extract `utils/snippetState.js` + `utils/vaultEntries.js` rather than raise a `legacySize` number | "Never raise a number; that turns the ratchet into permission." The sanctioned move is to beat the cap. Both stores held pure, already-tested logic that `utils/` should own anyway, so the extraction is the standards' own prescription rather than line-shuffling — and both baselines retightened.                                   | Raising the two entries; gutting load-bearing crypto comments to buy 10 lines; spreading `markNewRow` across five call sites  |
| 2026-08-07 | The marker retires on the row's PRIMARY action (open), not on any click on it                     | Drafted as "any pointerdown", which made starring retire it — and starring a row you just made is the ordinary response to finding it. That reading made the pinned+new state unreachable, which would have left the right-edge rail defending nothing. Opening the row is the unambiguous "found it, done with it".                     | Retire on any row interaction; retire on hover (fires while the pointer merely travels past)                                  |
| 2026-08-07 | Gate the theme sweep's `border` channel, not just `text`                                          | The design's central claim is that a solid accent EDGE clears 3:1 on all 14. The sweep collected `border` and reported only `text`, so that claim would never have been enforced. Six lines. The rail is a `::after`, which `querySelector` cannot reach, so the badge's keyline — the same accent on the same panel — stands in for it. | Leaving the keyline ungated; promoting the rail to a real element purely to be measurable                                     |

## Validation

- [x] `/validate` — 3 findings, 2 fixed in-run, 1 pre-existing and left open
      with the reason. Full report in `quality-audit.md`.
- [x] `npm run check` — green:
      `Test Files 192 passed | 1 skipped (193)`,
      `Tests 2650 passed | 2 skipped (2652)`,
      coverage `95.1% st / 88.03% br / 95.7% fn / 96.1% li` (floors 93/86/92/95).
- [x] UI seen running — `make e2e` in Docker: **395 passed, 2 skipped** (the two
      macOS-gated window-lifecycle specs). `make theme-sweep` across all 14:
      **504 measurements, none under floor**. The rendered PNGs were read for
      light, matrix and contrast.
- [x] every Docs-impact "yes" done — there are none; the table records why.
- [x] `make local-seed` — not applicable, no fixture change (recorded above).
- [x] token usage measured, header row filled.

**Bugs found and fixed this iteration — 2/2**

1. **Seeded first-run examples wore the NEW badge.** `add()` is the seam every
   create runs through, seeding and restoring included, so the marker fired for
   rows nobody made. Found by reading the sweep's own PNGs. Fixed with an
   explicit `marks` option (default true; false from `seedExamples`,
   `importFromFile`, both `restoreBundle` paths) and guarded by a new test.
2. **`make theme-sweep` dirtied 98 committed baseline PNGs.** The new surface
   left its scratch snippet behind, growing the sidebar once per theme. Its
   `close` now deletes the row through the real confirm dialog.

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since 2026-08-06T21:38:24Z
```

| category    |         tokens |
| ----------- | -------------: |
| input       |            277 |
| output      |         84,842 |
| cache write |        189,038 |
| cache read  |     35,257,679 |
| **total**   | **35,531,836** |

139 requests over a single uninterrupted session on this spec — no other work in
the window. Cache read dominates: it is context re-sent each turn at a fraction
of fresh input, so the total is tokens _processed_, not a cost. The `output` and
`cache write` columns track work produced.

**Outcome:** shipped. Four channels on one create event — insertion, a wash that
decays to nothing, a 3px accent rail on the row's right edge, and a `NEW`
keyline chip — plus the reveal and the retire rule. Every per-theme number was
re-derived from `themes.css` and then confirmed against the live DOM by
`make theme-sweep`; the two agreed exactly (badge keyline: solar 3.21, sepia
3.81, matrix 13.92).

Two things the build changed from the plan, both recorded in Decisions: the
marker became ONE key on `uiStore` rather than one per store (the size ratchet
refused the two-key version, and the reason exposed a real defect — two rows lit
in two sections), and the retire rule moved from "any click on the row" to "the
row's primary action", which is what makes the starred-and-new state reachable
rather than merely defended against.
