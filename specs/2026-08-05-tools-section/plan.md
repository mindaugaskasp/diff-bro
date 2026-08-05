# Tools as a fourth sidebar section

|                                         |                             |
| --------------------------------------- | --------------------------- |
| **Status**                              | in-progress                 |
| **Progress**                            | 13 / 14 steps               |
| **Branch**                              | `improvement/tools-section` |
| **Started**                             | 2026-08-05                  |
| **Finished**                            | —                           |
| **Bugs found and fixed this iteration** | 5 / 5                       |
| **Token baseline**                      | 2026-08-05T05:29:59Z        |
| **Claude tokens used**                  | —                           |

Proposal: [`proposal.md`](proposal.md) ·
[artifact rev 2](https://claude.ai/code/artifact/8c17c6aa-0db8-40d6-b168-bfaca9f80d82)

## Problem

The tools footer is leftover space, and it breaks four rules the rest of the
sidebar keeps. Every claim below was re-read against source, not taken from the
proposal.

| defect                                                                                        | evidence                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Chip height is **23.75px** — not `--control-h` (30), `--control-h-sm` (26) or `--chip-h` (20) | `ToolsShelf.css` `.usb-tool` sets no height; it falls out of padding + `--font-xs`                |
| Chip face is `--bg`, so it reads **raised on 7 light grounds, recessed on 7 dark**            | `ToolsShelf.css` `.usb-tool` `background: var(--bg)`                                              |
| It owns **5 contrast-debt rows**                                                              | `scripts/theme-pair-baseline.json` — sepia 3.93, solar 4.36, dark 3.75, meridian 4.18, solar 3.58 |
| The footer jumps **52 → 114px** the first time any tool is used, permanently                  | `ToolsShelf.vue:21` `v-if="recent.length"` gates a second `.usb-tools` strip                      |
| The rail shows **9** tools, the expanded sidebar **3** — collapsing shows you more            | `MAX_RECENT_TOOLS` 9 vs `SHELF_RECENT_TOOLS` 3, `utils/tools.js`                                  |
| Recents **reorder under the cursor** on every use                                             | `noteRecent` moves the used id to the front, `utils/tools.js`                                     |
| 12 tools registered, **3** reachable from the expanded sidebar                                | `utils/tools.js` `TOOLS`                                                                          |

**A second, separate defect this change must not inherit.** A pinned row's gold
bar is raw `var(--favorite)`. Measured against `--bg-panel` it scores **2.728
light · 2.229 solar · 2.623 sepia · 2.998 bloom** — **four** themes under the
3:1 non-text floor `check-theme-depth.mjs` holds everything else to. It ships
today in `SavedDiffRow.css:9` and the two `.star.on` rules; nothing measured it.
Tools adopting the same treatment would add a fifth failing surface.

> Corrected during step 1. The plan first recorded three themes: bloom rounds to
> 3.00 at 2 dp and was read as "exactly on the floor". The guard compares
> unrounded and failed it — 2.9977. Recorded because a rounded contrast figure
> is exactly how a fourth failing theme stays invisible.

## Solution

**Tools becomes the fourth sidebar section**, in a `features/tools/` slice, with
rows built on the grammar the other three already share: star leading, glyph in
the monogram box, name, meta. **Pins replace recents for ordering** — recency
decides membership, position never moves. The footer is deleted.

The pin-ink fix lands **first**, as step 1, so the new section never ships under
floor (see Decisions).

| option                            | why not                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Repaint the footer                | Leaves the permanent 62px cost, the seam jump, the 3-of-12 ceiling and the depth inversion       |
| Delete it; palette + menu only    | The sidebar is expanded by default, so tools would become rail-only for most people              |
| Tools in the top toolbar          | That bar is per-comparison; tools are global, and 12 do not fit at any window width              |
| A 12-tile icon grid               | ≈120px permanent, and icon-only is unreadable across an abstract glyph set                       |
| Keep recents **and** add pins     | Two orderings in one 256px column, and the recents half still moves under the cursor             |
| Sort the six by recency           | That is the defect — recency decides membership, position stays put                              |
| A search field inside the section | Mistaken for a search input; the sidebar search already reaches every section                    |
| Pins in `settingsStore`           | Pinned at exactly 308 lines by `legacySize.mjs`; one line over fails the build                   |
| Pin ink as a raw `--favorite`     | Fails 3:1 on light, solar and sepia — the defect above                                           |
| Fix pin ink in a later change     | Ships a new surface knowingly under floor; the guard row would have to be baselined then unwound |

## Scope

**In:**

- `--pin-ink` token + a `check-theme-depth.mjs` rule, applied to all three
  existing pinned-row surfaces
- `features/tools/` slice: `toolsStore.js` (pins, own `persist.js` key),
  `index.js`, `components/ToolsSection.vue`, `components/ToolRow.vue`,
  `components/styles/*.css`
- `toolRows()` in `utils/tools.js` — pure, pinned-first, both groups in registry
  order
- `SECTIONS` gains `'tools'`; `sanitizeSectionOrder` migrates rather than resets
- `SavedDiffs.vue` mounts the section, drops `<ToolsShelf />`
- `SidebarRail.vue` reads the same `toolRows`, so the two surfaces agree
- Deletions: `ToolsShelf.vue`, `ToolsShelf.css`, the `usb-tools*` rules in
  `SavedDiffs.css`, `SHELF_RECENT_TOOLS`, `e2e/tools-shelf.spec.mjs`, the
  footer-alignment test in `e2e/spreadsheet.spec.mjs`, 5 baseline rows

**Out:** _(recorded, not drifted)_

- A full-width status band under both columns — the structural answer to the
  bottom seam. Its own spec if the seam is ever wanted back (Decisions, 2026-08-05).
- Reordering tools by drag. Registry order is deliberate; pins are the only
  user-controlled ordering.
- Changing any tool panel, the palette, or the Tools menu.

## Design

Token-driven throughout; no literal colour, size or radius.

**The row.** One line, exactly `SnippetRow`'s anatomy, so the sidebar keeps one
left rail:

| element         | px  | runs to | source                                       |
| --------------- | --- | ------- | -------------------------------------------- |
| `.section-body` | 16  | 16      | `padding-left: var(--space-4)`, all sections |
| `.star`         | 26  | 42      | `min-width` + `padding: 0 4px 0 8px`         |
| `.entry`        | 6   | 48      | `padding-left`                               |
| `.monogram`     | 27  | 75      | `ui.css`, fixed 27×20                        |
| gap             | 9   | 84      | `.entry` column gap                          |

A tool has no language, so it has no monogram — but it takes the badge's **box**
with its `<AppIcon>` inside and `--fam` unset, so the underline falls back to
`--border` and the name column stays at 84 across all four sections. Row height
comes from the shared `.entry` padding, not a bespoke box.

**The header** is `SectionHeader` in `unified` mode (what the live sidebar
passes): quiet group label, no elevated band, no border, count only while
filtering. Its actions slot holds one `.btn.btn-icon` opening the tools palette
— replacing the deleted "Browse all tools" band.

**Pin state is encoded twice** — a filled-vs-outline star and the ink — so it
survives greyscale. The bar is `inset 3px 0 0 var(--pin-ink)` over a 12% fill,
matching `SavedDiffRow.css` once step 1 lands.

**New token.** `--pin-ink: color-mix(in srgb, var(--favorite) 70%, var(--text))`
in `tokens.css` — the trick `--btn-edge` and `--dg-del` already use. Structural,
not per-theme, so it re-resolves against each palette.

### Theme verdict — all 14

Values parsed from `styles/themes.css` (`scripts/` scratch parse, not guessed).
`bar now` / `bar --pin-ink` are the pinned bar against `--bg-panel`; floor 3.0.
`name` and `kind` are row text on the panel; floor 4.5. `star` is the resting
outline star; floor 3.0.

| theme    | ground | name  | kind  | star  | bar now   | bar `--pin-ink` | verdict | note                                                                                                                                                                               |
| -------- | ------ | ----- | ----- | ----- | --------- | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| light    | light  | 15.99 | 10.12 | 6.06  | **2.73**  | 4.61            | pass    | floating-canvas inversion; bar fixed by step 1                                                                                                                                     |
| dark     | dark   | 14.64 | 10.74 | 5.62  | 6.85      | 8.63            | pass    |                                                                                                                                                                                    |
| solar    | light  | 12.18 | 6.33  | 3.99  | **2.23**  | 3.52            | pass    | worst bar in the set; 3.52 is the binding margin                                                                                                                                   |
| neon     | dark   | 15.68 | 10.59 | 6.04  | 13.43     | 13.91           | pass    | accent `#22d3ee` — section adds no accent glow                                                                                                                                     |
| nord     | dark   | 8.73  | 7.45  | 4.05  | 6.44      | 7.06            | pass    |                                                                                                                                                                                    |
| sepia    | light  | 8.55  | 5.92  | 3.44  | **2.62**  | 3.69            | pass    | lowest resting star of all 14, still over 3.0                                                                                                                                      |
| dim      | dark   | 12.99 | 9.01  | 5.12  | 8.45      | 9.60            | pass    |                                                                                                                                                                                    |
| beacon   | dark   | 19.68 | 15.77 | 12.26 | 13.63     | 15.12           | pass    | hard keyline `#e0e0e0` on `#000000` — rows and unified headers carry no border, so nothing to soften                                                                               |
| meridian | light  | 11.64 | 8.11  | 4.90  | 3.31      | 4.82            | pass    |                                                                                                                                                                                    |
| linen    | light  | 13.57 | 7.80  | 4.56  | 3.37      | 5.11            | pass    |                                                                                                                                                                                    |
| bloom    | light  | 12.80 | 7.74  | 4.31  | **2.998** | 4.59            | pass    | under floor once unrounded — the correction noted under Problem                                                                                                                    |
| nyan     | dark   | 15.04 | 11.44 | 7.44  | 12.19     | 12.83           | pass    | accent `#ff2ecb` — no accent-tinted glow added                                                                                                                                     |
| matrix   | dark   | 16.87 | 12.89 | 6.87  | 14.28     | 14.79           | pass    | `--favorite` `#7cfc00` vs `--accent` `#00ff41` differ by only 1.03 — pinned bar and accent read as one hue. Pre-existing, shared with the other two sections; **not** widened here |
| contrast | light  | 18.76 | 15.55 | 11.29 | 4.59      | 7.63            | pass    | hard keyline `#111111` — untouched                                                                                                                                                 |

Bold = under floor today. Every other pair clears on all 14; the section adds no
new debt of its own.

## Security rules touched

**None.** No IPC handler, no fs, no crypto, no new dependency, no
`shell.openExternal`, no new import surface, no injection sink. Pins are an
organizational preference persisted as plaintext through the existing
`persist.js` key mechanism — the same class of data as `sectionOrder`, and
explicitly what `settingsDefaults.js` documents that file as holding. The
renderer/main fence is untouched: the slice imports only `utils/`, `stores/` and
shared `components/`.

## Test plan

Written before the code.

- **unit** — `tests/renderer/utils/tools.test.js`: `toolRows()` puts pinned
  first and everything else in registry order; **permuting `recent` must not
  change the output** (the load-bearing assertion — it fails against a naive
  recency-ordered implementation).
- **unit** — `tests/renderer/utils/settingsDefaults.test.js`:
  `sanitizeSectionOrder(['snippets','saved','external'])` keeps the user's order
  and **appends** `'tools'` rather than resetting to `SECTIONS`. Watched failing
  against today's exact-set check.
- **unit** — `tests/renderer/features/tools/toolsStore.test.js`: pin, unpin,
  round-trip through `persist.js`, and an unknown id in the stored pins is
  dropped rather than rendered.
- **e2e** — `e2e/tools-section.spec.mjs` (replaces `tools-shelf.spec.mjs`): the
  section lists every tool, a row opens its dialog, pinning moves a tool to the
  top, **and the pin survives a relaunch** — the persistence path jsdom cannot
  see.
- **e2e** — same spec: using a tool does **not** move it, which is the whole
  argument for pins over recents.
- **guard** — `check-theme-depth.mjs` gains a `pin-ink/panel` rule at 3.0.
  Watched failing with raw `--favorite` (light/solar/sepia) before the token
  lands, then green.
- **red → green** — each recorded in Decisions with the observed failure text.
- **seed fixtures** — none. No new file format; `seed-local.mjs` unchanged.

## Docs impact

| surface                    | needed? | what changes                                                                                                                                 |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                | **yes** | Two `alt` texts describe the sidebar as "saved diffs, shared diffs, snippets, and tags" (lines 25, 119) — a fourth section makes them wrong  |
| `docs/screenshots/*.png`   | **yes** | All 6 show the sidebar with the tools footer; `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`, `diagram-diff` |
| `docs/screenshots/themes/` | **no**  | 42 frames, all of the settings/email dialogs — the sidebar is not in frame                                                                   |
| `docs/roadmap.md`          | **no**  | No mermaid node or bullet covers the tools shelf; grep for "tool" returns nothing                                                            |
| `docs/brand/roadmap.svg`   | **no**  | Same — no roadmap item moves                                                                                                                 |
| `docs/security.md`         | **no**  | No security posture changes; no IPC, crypto or external-link surface touched                                                                 |
| `docs/ipc-security.md`     | **no**  | No IPC handler added or changed                                                                                                              |
| `docs/glossary.md`         | **no**  | No new user-facing term — "pin" already exists for favourited diffs and snippets                                                             |
| `docs/standards.md`        | **no**  | The slice follows the documented pattern; no rule added or amended                                                                           |

## Implementation plan

- [x] 1. `--pin-ink` in `tokens.css`; applied in `SavedDiffRow.css` (bar + star)
      and `SnippetRow.css` (star). Added the `pin-ink/panel` rule (min 3.0) to
      `check-theme-depth.mjs`. **Red:** `4 violation(s) — light 2.73, solar 2.23,
sepia 2.62, bloom 3.00 < 3 (control)` with `--pin-ink: var(--favorite)`.
      **Green:** `✓ theme depth ok (14 themes)` with the 70% mix.
      `SnippetsPanel.css`'s `.shelf.fav` proved to be dead CSS — see Decisions.
- [x] 2. `toolRows()` in `utils/tools.js` + its permutation test. **Red:**
      `8 failed | 20 passed — TypeError: toolRows is not a function`.
      **Green:** `28 passed`. **Amended:** `SHELF_RECENT_TOOLS` moves to step 10
      — its only consumer is `ToolsShelf.vue`, so deleting the constant here
      would break that file for eight steps.
- [x] 3. `tests/renderer/utils/settingsDefaults.test.js` + `'tools'` in
      `SECTIONS`. **Red:** `expected ['snippets','saved','external'] to deeply
equal ['snippets','saved',…(2)]`. **Green:** `50 passed` across the three
      section-order files. **No migration fix was needed** — see the correction
      below. Five existing tests hardcoded the three-section array and were
      rewritten against `SECTIONS`/`slice(0, 3)` so the next section added
      cannot break them again. The stale comment on `sanitizeSectionOrder` — the
      one that caused the wrong premise — was rewritten to describe what the
      function does.

> **Premise corrected.** Both `proposal.md` and this plan claimed
> `sanitizeSectionOrder` "rejects any order that isn't exactly the known set, so
> every stored three-item order falls back to the default". It does not: it has
> always appended missing sections
> (`for (const id of SECTIONS) if (!kept.includes(id)) kept.push(id)`), so a
> stored `['snippets','saved','external']` migrates to
> `['snippets','saved','external','tools']` with the user's drag order intact.
> Verified by running it before changing anything. What misled both documents was
> the function's own comment, which described a stricter rule than the code. The
> risk flagged to the user as the one thing that "breaks silently for existing
> users" was not real.

- [x] 4. `features/tools/toolsStore.js` — pins over their own `persist.js` key.
      **Red:** `Failed to resolve import "…/features/tools"`. **Green:**
      `8 passed`. 44 lines. Also added `'tools'` to `STORE_NAMES` — see the bug
      below.
- [x] 5. `features/tools/components/ToolRow.vue` + `styles/ToolRow.css` — star
      leading, `<AppIcon>` in the monogram box, kind as trailing meta. A
      `ToolRow` typedef went into `types.js` with a `shaped(...)` validator.
- [x] 6. `features/tools/components/ToolsSection.vue` + styles — `SectionHeader`
      in `unified` mode, palette button in the actions slot, six rows plus a
      two-way "N more tools" / "Show fewer" disclosure. The disclosure's leading
      spacer is `var(--control-h-sm)`, which IS the star's 26px box, so the rail
      cannot drift between a row and the disclosure.
- [x] 7. `features/tools/index.js` — the slice's only importable surface.
- [x] 8. `SavedDiffs.vue` — fourth pill in `SECTIONS`/`SECTION_VIEW`, mounted the
      section, dropped `<ToolsShelf />`. Script 91 → 93 of 100.
- [x] 9. `SidebarRail.vue` — reads `toolsStore.railRows(fits)`, so the rail and
      the section order by the same rule. Dropped its now-unused `settingsStore`
      import; pinned rail buttons carry the same `--pin-ink` bar.
- [x] 10. Deleted `ToolsShelf.vue`, `ToolsShelf.css`, `SHELF_RECENT_TOOLS`, and
      the 5 `ToolsShelf.css` rows in `theme-pair-baseline.json` (160 → 155).
      **Amended:** there were no `usb-tools*` rules in `SavedDiffs.css` — all of
      them lived in `ToolsShelf.css` and went with it.
- [x] 11. `e2e/tools-section.spec.mjs` (7 tests, including the relaunch that
      proves persistence and the "using a tool does not move it" assertion the
      shelf made false by construction). Deleted `e2e/tools-shelf.spec.mjs` and
      the footer-alignment test in `e2e/spreadsheet.spec.mjs`. **Amended:** two
      more specs referenced the deleted shelf and the plan had missed them —
      `e2e/ui-affordances.spec.mjs` and `e2e/tools-keyboard.spec.mjs` opened the
      palette via `.usb-tool-all` (5 call sites, repointed at the section
      header's "Search every tool" button), and `ui-affordances` owned a
      shelf-padding test that went with the shelf.
- [x] 12. `theme-sweep.mjs` — `tools-section` surface, with the third row
      **hovered** and the first pinned, so both states are measured.
- [x] 13. Docs: README `alt` text on both screenshot lines, plus the Tools
      feature row, which described the panels but not where they live.
      Screenshots: see Validation.
- [ ] 14. `npx prettier --write` on touched files; `npm run check`; `/validate`.

## Bugs found and fixed

**1 — the pinned tools would not have persisted.** `tests/main/dataFiles.test.js`
failed with `expected ['tools (persisted store)'] to deeply equal []`.
`STORE_NAMES` in `src/main/dataFiles.js` is the allowlist `store:load` /
`store:save` validate against, and a name that is not on it is **rejected** —
so every pin would have been dropped on quit. It would have passed every unit
test, because `persist.js` falls back to `localStorage` when the store IPC is
absent, which is exactly the jsdom case. Caught by a guard written for this
class of mistake ("three files were missing from it, and a missing name is
silent data loss"); fixed by registering `'tools'`, which also makes pins travel
when the data directory moves.

**2 — snippets had lost their favourite highlight entirely.** Reported by the
user mid-build, and a direct consequence of the dead CSS found in step 1: the
only rule that drew a favourited snippet row was `.shelf.fav .row` in
`SnippetsPanel.css`, and the `.shelf` markup it targets was removed when the
separate favourites shelf went away. `SnippetRow.vue`'s `<li>` never carried a
`favorite` class at all, so a starred snippet looked identical to an unstarred
one while saved diffs and tools both drew a bar and a wash. Nothing failed
because nothing measured the mark. Fixed with `:class="{ favorite }"` plus a
live `.row.favorite` rule, and the dead `.shelf.fav` rules deleted so the next
reader is not misled the same way. Guarded by
`e2e/favorite-row-marks.spec.mjs`, which asserts the snippet row's computed
`box-shadow` and `background-color` are **identical** to a pinned tool's —
presence alone would not have caught the 9%-vs-12% drift the dead rule also had.
Red → green recorded.

## Adjacent work, requested during the build

Nine changes the user asked for while this spec was in progress. They are **not
tools-section work** and are recorded here rather than folded into the scope
above, because a reader comparing this plan to the diff would otherwise find
files nothing accounts for. Each got the same treatment as the spec's own steps:
a failing test first where it was a bug, and a guard that would catch the
regression again.

| #   | request                                                         | what it turned out to be                                                                                                                                                                                                                                                                                                                                                                                                                                                    | guard                                                                                 |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Snippets have no favourite highlight                            | Bug — see above                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `e2e/favorite-row-marks.spec.mjs`                                                     |
| 2   | Settings dialog resizes per pane                                | Bug: `.settings-pane` carried `min-height: 232px`, shorter than **every** pane shipping today, so the dialog swung 364→720px. Replaced with a fixed 380px box that scrolls — a min-height is only right until a pane outgrows it, which is how the 232 rotted.                                                                                                                                                                                                              | `e2e/settings.spec.mjs` "keeps one height across every pane"                          |
| 3   | Mermaid theme should not outlive its dialog                     | Bug: both controls wrote `settings.setDiagramTheme`, so one look at one diagram re-themed every diagram afterwards **and survived a relaunch**. Now a per-viewer `ref`, seeded from the stored default. A pre-existing test asserting the opposite ("a viewing preference that resets every launch is not a preference") was rewritten, not patched — its premise was the bug.                                                                                              | `e2e/mermaid-theme.spec.mjs` ×2                                                       |
| 4   | Mermaid theme should follow the app's ground                    | Already correct: `effectiveDiagramMode` resolves Auto to dark for all 7 dark themes and light for all 7 light ones (verified against `THEMES`). The _symptom_ was #3 — a stale persisted pin. No code change.                                                                                                                                                                                                                                                               | covered by #3                                                                         |
| 5   | Diagram change list should be collapsible, collapsed by default | Feature. Toggle in the legend bar; the test asserts the stage **gains the rail's width**, not merely that the rail vanished.                                                                                                                                                                                                                                                                                                                                                | `e2e/diagram-diff.spec.mjs`                                                           |
| 6   | Diagram diff should zoom on wheel / trackpad pinch              | Feature: pinch already worked (macOS sends `ctrlKey` wheel); a plain wheel was explicitly ignored. Now both zoom, with a delta-proportional step so a pinch's dozens of tiny events do not race the range. `useZoomPan` had **no unit test at all** — it has one now.                                                                                                                                                                                                       | `tests/renderer/composables/useZoomPan.test.js` (8 cases)                             |
| 7   | Mermaid/CSV/XLSX should open in their own view                  | Feature: `defaultSemanticView` in `utils/viewChrome.js` (pure, beside its siblings), applied per comparison so an explicit untick stands. A `diffStore` test asserting "stays a text comparison until the toggle is on" was rewritten — same premise-overruled case as #3.                                                                                                                                                                                                  | `tests/renderer/utils/viewChrome.test.js`, `diffStore.test.js`                        |
| 8   | Diagram toggle jumps when pressed                               | Bug: it sat **between** two conditional checkboxes — "Ignore whitespace" (text only) and "Focus on changes" (diagram only) — so every press swapped a left neighbour for a right one and slid it **150px** under the cursor.                                                                                                                                                                                                                                                | `e2e/diagram-diff.spec.mjs` "keeps its position when pressed"                         |
| 9   | Disable the view toggles instead of hiding them                 | Superseded #8's fix, and is better: **no** toggle is removed now — each keeps its slot, greys out, and says why in its tip, so the row cannot re-flow for any view rather than just this one. This overrules the comment that stood there ("a control that cannot act should not be offered: Split view beside a grid reads as broken, not as N/A"). The trade the user made explicit: a disabled control with a reason reads as N/A; a row that jumps reads as a misclick. | `e2e/csv-grid.spec.mjs`, rewritten to assert disabled-and-unmoved rather than removed |

Two ratchets bit during this work and neither was raised:
`useSnippetDraft` (184) and `diffStore.js` (783). Both were brought back under by
shortening comments that restated their code and by moving the new pure rule into
`utils/`, which is where it belonged anyway.

## Decisions

| date       | decision                                                                                                                                                                                                      | why                                                                                                                                                                                                                                                                                                     | rejected                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2026-08-05 | The footer-alignment e2e is **deleted** with the footer                                                                                                                                                       | With no footer there is nothing to align; the bug is removed at the root rather than guarded. User-confirmed.                                                                                                                                                                                           | Keeping an empty 52px band; a full-width status band (own spec)  |
| 2026-08-05 | The pin-ink fix is **step 1 of this spec**, not a separate one                                                                                                                                                | The new section must not ship knowingly under floor, and the guard row would otherwise have to be baselined then unwound. User-confirmed.                                                                                                                                                               | Its own spec first; fixing Tools only and leaving the other two  |
| 2026-08-05 | Tools **is** a `features/tools/` slice — overturning `proposal.md`'s rejection                                                                                                                                | The rejection cited a cycle that does not exist: `components/` imports slice `index.js` in 6 places already (`SavedDiffRow`, `AppDialogs`, `AppToolbar`, …), and **no** `stores/` or `utils/` file imports a feature. A slice importing `utils/tools.js` is explicitly allowed.                         | `ToolsSection.vue` in `components/` + a `useToolPins` composable |
| 2026-08-05 | Pins live in the slice store over their **own `persist.js` key**                                                                                                                                              | `settingsStore.js` is at exactly 308 lines with a `legacySize.mjs` entry of 308 — one line over fails the build. `configBackup`, `email` and `onboarding` already own their own keys, so this is the established precedent.                                                                             | Adding `favoriteTools` to `settingsStore`                        |
| 2026-08-05 | The matrix `--favorite`/`--accent` collision (1.03) is **noted, not fixed**                                                                                                                                   | Pre-existing and shared with saved diffs and snippets; changing a theme's gold is a palette decision, not this feature's.                                                                                                                                                                               | Re-tinting `--favorite` on matrix inside this change             |
| 2026-08-05 | `--pin-ink` applied to the **live** row marks only — the bar and the two `.star.on`/`.star:hover` rules                                                                                                       | The 12%/22% row wash stays raw `--favorite`: it carries the gold identity, the mark carries the contrast, and the star measured against that wash still clears 3:1 on all 14 (weakest solar 3.20).                                                                                                      | Re-tinting the wash too                                          |
| 2026-08-05 | The favourites-shelf CSS in `SnippetsPanel.css` (`.shelf.fav .row`), `SavedDiffsSection.css` (`.grp-name.gold`, `.grp-icon.gold`) and `ExternalDiffsSection.css` (`.fav-head`) is **dead** and left untouched | No `.vue` file references any of those classes — they are leftovers from the old separate-favourites-shelf design. Deleting them is right but belongs to a cleanup, not to this diff.                                                                                                                   | Deleting it here and inflating the diff                          |
| 2026-08-05 | The ★ **filter toggle** (`SavedDiffs.css` `.usb-seg .star.on`) keeps raw `--favorite`                                                                                                                         | It is a control state, not a pinned-row mark, and its affordance is carried by a border plus an 18% fill. Its edge is nonetheless under 3:1 on the same four themes — recorded as an adjacent finding, out of this scope.                                                                               | Widening step 1 past pinned rows                                 |
| 2026-08-05 | Contrast table **re-derived** from `themes.css`, not taken from the artifact                                                                                                                                  | `proposal.md` explicitly flagged the artifact's table as unverified. The re-parse reproduced the 5 existing baseline numbers exactly.                                                                                                                                                                   | Trusting the proposal's table                                    |
| 2026-08-05 | `openMenu` in `e2e/fixtures.mjs` is scoped to `.menubar`                                                                                                                                                      | The new sidebar pill made `getByRole('button', { name: 'Tools' })` match two elements, so all 27 `openMenu(page, 'Tools', …)` call sites across 12 specs died on a strict-mode violation. Fixing the shared helper fixes every one; per-spec locators would have to be redone for the next section too. | Disambiguating in each of the 12 specs                           |

## Validation

Recorded as fact, not intention.

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] UI seen running (Docker / `make e2e`)
- [ ] `make theme-sweep` — the new `tools-section` surface across all 14
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category    | tokens |
| ----------- | -----: |
| input       |        |
| output      |        |
| cache write |        |
| cache read  |        |
| **total**   |        |

**Outcome:**

## Codebase audit (requested mid-build)

Three parallel audits of the WHOLE codebase — QA, senior-engineer code review,
security — not just this branch. What was resolved here, and what was recorded
rather than fixed.

### Resolved

| #   | source   | finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | fix                                                                                                                                                                                                                                                                                                       |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | security | **Snippet-bundle signer attribution was forgeable.** `openSnippets` verified the signature against a key carried _inside the file_, then returned `inner.signer` — an unbound fingerprint claim — which the renderer matched against the trust store to print _"Signed by trusted key Alice"_. A fingerprint is public, so Mallory could sign with her own key, rewrite the claim, and impersonate a trusted sender. Snippets are code the user pastes and runs. The existing test at `snippetSealing.test.js:55` looked like it covered this but swapped `signerKey` while keeping Alice's signature, so it failed for the wrong reason — a test that never failed for its bug. | `signerFrom()` resolves the signer from the LOCAL trust store by matching the key that actually signed; `inner.signer` is now advisory only. Null means "signed, but not by a key you trust". Mirrors `sealing.js`, which always did this correctly. Guarded by a test that reproduces the exact forgery. |
| A2  | security | `share:importPath` and `share:readKeyFile` read a **renderer-named path** without `mayReadPath` — the one gate every other reader honours. Not an arbitrary-read primitive (both parse-gate their output), but a real invariant hole and a file-shape oracle.                                                                                                                                                                                                                                                                                                                                                                                                                    | Both gated; `{ error: 'not-permitted' }` otherwise. The drop flow registers its path through `file:allowDropPath` first, so the legitimate caller is unchanged.                                                                                                                                           |
| A3  | QA       | **Two keyboard shortcuts were bound but undiscoverable** — `MOD+Shift+F` (Copy Diff as File) and `MOD+B` (Toggle Sidebar) worked and appeared nowhere in Help ▸ Keyboard Shortcuts. The existing test asserted six hardcoded labels, so deleting any row still passed.                                                                                                                                                                                                                                                                                                                                                                                                           | Both rows added, plus a test that cross-checks **every** `keys` in `buildMenus()` against `SHORTCUT_GROUPS` in both directions. Proven red→green by deleting a row.                                                                                                                                       |
| A4  | QA       | `openSnippets('not an object')` asserted with `.resolves.toBeTruthy()` — satisfied by `{ ok: true }` on a hostile input, the precise failure rule 6 exists to prevent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Asserts the exact verdict.                                                                                                                                                                                                                                                                                |
| A5  | engineer | `SnippetRow` flashed **"Copied" when the clipboard write had failed** — the result was never inspected, unlike every other copy path in the repo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Gated on `res?.ok`, with a notice on failure.                                                                                                                                                                                                                                                             |
| A6  | QA       | A zero-assertion debug spec (`e2e/_shot.spec.mjs`) I had left behind was running in the suite on a hardcoded container path, and three untracked PNGs sat in the repo root, ungitignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Both deleted.                                                                                                                                                                                                                                                                                             |

### Recorded, not fixed — worth their own specs

- **QA: rotation's core invariant is asserted by a counter, not a decrypt.** `key-rotation.spec.mjs` checks `retiredKeyCount() === 1`; replacing `decryptionIdentities()` with `[await getIdentity()]` keeps both rotation specs green while **every unopened diff sealed to the pre-rotation key becomes permanently unreadable**. Needs a seal → rotate → open e2e. Highest-value item left.
- **QA: coverage floors are stale** (93/86/92/95 vs actual 95.4/87.8/96.0/96.5). Four points of function slack is enough to delete every `shareStore` and `uiStore` test and stay green — which is how their gaps stayed invisible. Nine tested `src/main/` modules are also outside the coverage `include`, `shareExport.js` and `trustedKeys.js` among them.
- **QA: `shareStore.emailTo`/`shareTo` have no unit test at all** (54.8% st / 32.5% br, worst in the measured set); the untested branches include the `localCopy === false` split that decides whether the sender keeps a record of what they sent.
- **Engineer: `useCopyFeedback` is bypassed by ten hand-rolled copies** in the tool panels, each with a 900ms timer against the composable's 1200ms, none clearing the previous timer or disposing on unmount — the two bugs the composable was written to eliminate, at 10×.
- **Engineer: ~130 lines of dead favourites-shelf CSS** across `SnippetsPanel.css`, `SavedDiffsSection.css`, `ExternalDiffsSection.css`, plus a dead fourth `.btn-icon` (`.icon-btn` in `AppToolbar.css`) and four dead `ui.css` classes. I deleted the `.shelf.fav` rules because they hid bug #1; the rest is a cleanup pass.
- **Engineer: `diffStore.js` at 783 lines** has three cohesive concerns (format-hint banner, disk-refresh watcher, save-first chain) that would extract to ~580 with no other consumers.
- **Security (low):** `git:register`/`cli:install` write an executable onto `PATH` with no confirm, unlike `openExternal`; `sweepGitTemp` uses `statSync` where `sweepStage` deliberately uses `lstat`; `structuralDiff` recursion has no depth cap; `docs/standards.md` rule 7 is stale (two `shell.openPath` sites arrived without the doc following).

The security audit's verdict on everything else was that it holds — offline
guarantee, renderer/main fence, keys-never-cross-IPC, all five crypto
invariants, untrusted-input caps, the `linkPolicy` edge cases and the injection
ban were each checked and found correct. `npm audit`: 0 vulnerabilities.
