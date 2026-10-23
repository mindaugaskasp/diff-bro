# Sidebar workspace: rail, Home, and a modern row/tile language

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 14 / 14 steps |
| **Branch** | `improvement/sidebar-workspace` |
| **Started** | 2026-10-23 |
| **Finished** | 2026-10-23 |
| **Bugs found and fixed this iteration** | 7 / 7 |
| **Token baseline** | 2026-10-22T21:21:19Z |
| **Claude tokens used** | 128,279,267 processed (127.7M cache read) — window also covers the screenshot/theme-sweep runs of this branch |

## Problem

The sidebar stacks four equal sections (Saved, External, Snippets, Tools) in one
scroll (`SavedDiffs.vue:181`, `settings.orderedSections`). Measured against the
shipping themes:

- **Metadata is under the reading floor on four themes.** Row ages, counts and
  tag names use `--text-dim`, which on `--bg-panel` is 3.99:1 (solar), 3.44:1
  (sepia), 4.05:1 (nord), 4.31:1 (bloom), below 4.5:1 for 10.5–11.5px text.
- **Hierarchy runs backwards.** Section headers are bold, uppercase and tracked
  (`SectionHeader.vue`), louder than the rows. The snippet name, the thing being
  looked for, is truncated to "Ex…" because the monogram, the var count, a tag,
  "+1" and the age share its single line (`SnippetRow.vue`).
- **Space goes to nothing.** An empty Saved section costs ~100px plus a primary
  "New comparison" button that repeats the toolbar. An empty External section
  costs a header and an "Empty" row. Twelve fixed tools take ~40% of the height
  at 1080p.
- **It looks dated.** Every tool is a grey face with a 3:1 outline and a drop
  shadow, a keycap idiom. Every row shows an idle star.
- **It doesn't scale.** At 50+ snippets, Tools and Saved scroll out of reach.
  The only way to change kind is scrolling past the others.

Design study (the screens this plan builds):
https://claude.ai/artifact/BX4VXYZAVJENgowrUHhVEZ, boards `Workspace.dc.html`
and `Sweep.dc.html`.

## Solution

A rail plus one panel. The rail is the existing collapsed `SidebarRail`,
promoted to always visible. It holds **Home · Diffs · Snippets · Tools**, with
counts, and **Keys** at the foot. The panel beside it shows one destination at
full height, with search scoped to that panel ("Search everything" on Home).
Collapsing hides the panel and leaves the rail, so collapsed and expanded are
the same component instead of two.

- **Home** (the default panel): *Pinned* cards (anything starred: diff, snippet,
  tool), *Recent* (diffs and snippets merged by `updatedAt`/`createdAt`, grouped
  Today / Yesterday / Earlier this week), and *Quick tools* (the 4 most recent
  or pinned).
- **Diffs**: a `Mine · N / Received · N` segmented control replaces the separate
  External section. Received keeps its expiry countdown and sender.
- **Snippets**: tag filter chips (single line, `+N` opens the existing
  `TagPickerPopover`), then two-line rows.
- **Tools**: grouped by job (Encode, Format, Generate, Inspect, Secure & apply)
  as tiles.

The visual language is the same everywhere: a 26px hue-tinted *glyph well* per
row, name on line one, meta on line two, age on the right, actions on
hover/focus only. Raised cards are 12px radius, and search is a floating pill.

| option | why not |
|---|---|
| A · Ledger (re-ranked single scroll) | fixes hierarchy and ink, not scale; still a 4-section scroll |
| B · Switchboard (rail, no Home) | changing kind costs a click and there's no "what was I doing" view |
| D · single scroll + pins + dock | strains at 50+ snippets, same as A |
| F · accordion focus stack | only one list visible; closed sections hide what Home shows |
| Hunk (diff-native mono) | monospace everywhere slows reading; doesn't combine with the rest |

## Scope

**In:** the rail, the four panels, the Mine/Received switch, the row/tile
restyle (`SavedDiffRow`, `SnippetRow`, `ToolRow`, `SectionHeader`), the new
tokens, theme-depth floors for them, e2e migration, screenshots, README.

**Out:**
- moving the toolbar's *My key / Trusted key* into the rail's **Keys** button.
  It touches `AppToolbar` and the onboarding tour, so it goes in a follow-up
  spec. Keys opens the same menu the toolbar does for now.
- a new data field: Recent uses existing timestamps only. Last-opened time is
  not tracked today, and adding it is a persistence change.
- the Claude connection inbox: separate spec, `specs/2026-10-23-claude-mcp/plan.md`.

## Design

Tokens, added to `themes.css`/`tokens.css` and never as literals in components:

| token | value | why |
|---|---|---|
| `--text-meta` | `color-mix(in srgb, var(--text-dim) 50%, var(--text))` | ≥ 5.42:1 on `--bg-panel` in all 20 (sepia worst) |
| `--line` | `color-mix(in srgb, var(--text) 12%, var(--bg-panel))`; `= var(--border)` under `contrast`, `beacon`, `volcano` | hairline; the three hard-keyline themes keep their contract |
| `--bg-card` (new; amended from "change `--bg-raised`") | `var(--bg)` on the 8 light-ground themes; else `color-mix(in srgb, var(--bg-panel) 94%, var(--text))` | a card must be lighter than the panel it floats on. `--bg-raised` has 19+ app-wide users and its `raised/canvas` floor would break on light grounds, so the sidebar gets its own role |
| `--hue-{diff,snippet,received,encode,format,generate,inspect,secure}` | fixed hex per job | identity only, never painted as text |
| `--well-*` | `color-mix(in srgb, var(--hue-*) 16%, var(--bg-raised))` | carries the colour |
| `--glyph-*` | `color-mix(in srgb, var(--hue-*) 30%, var(--text))` | carries legibility: ≥ 4.65:1 on its well in all 20 (nord worst) |
| selection | `color-mix(in srgb, var(--accent) 12%, var(--bg-panel))` under `--text` | ≥ 7:1 in all 20 |

Rules:
- `--accent` is never label ink. It's below 4.5:1 on `--bg-panel` in light
  (4.49), solar, sepia, meridian and bloom. It appears only as the rail's 3px
  active bar and the active chip's 1px edge, both non-text (≥ 3.81:1 everywhere).
- Heights from the scale: rail item 52px is a new `--rail-item` token; rows 42px
  are `--row-h-2`; the search pill uses `--control-h`; chips use `--chip-h`. No
  padding-derived heights.
- The panel's first strip keeps `.band .band-row` so it lines up with the file
  slots across the divider.
- Icons via `<AppIcon>`. Adds `home`, `grid`, `inbox` to `icons.js` if missing.
- Tool tiles: resting affordance comes from three cues: the well, `--bg-raised`
  and `--shadow-1`. They drop the 3:1 `--btn-edge` keyline the standards require
  of `.btn`. Tiles are a new `.tile` class in `ui.css`, not `.btn`, and
  `check-theme-depth.mjs` gets its own floor for the tile: well vs `--bg-raised`
  is a shape, so glyph-on-well ≥ 4.5 and tile `--bg-raised` vs panel ≥ 1.05 plus
  shadow. This replaces a written standard; signed off 2026-10-23 (see Decisions).

### Theme verdict — all 20

Computed from `themes.css` values. "meta" = `--text-meta` on `--bg-panel`;
"glyph" = worst `--glyph-*` on its `--well-*`.

| theme | ground | verdict | note |
|---|---|---|---|
| light | light | pass | meta 6.9 · glyph ≥ 6 · `--bg-raised` white cards on tinted panel, as today |
| dark | dark | pass | accent `#2f81f7` used as bar only |
| solar | light | pass after fix | `--bg-raised` must become `--bg` (`#fffdf6`); today's `--text-dim` meta is 3.99 |
| neon | dark | pass | accent `#22d3ee`: no glow anywhere; wells are 16% tints |
| nord | dark | pass, tightest | glyph 4.65 worst of all · meta 6.10 |
| sepia | light | pass after fix | meta 5.42 (was 3.44) · keyline-free tiles rely on shadow + well |
| dim | dark | pass | |
| beacon | dark | pass | `--line = --border #e0e0e0` kept hard |
| meridian | light | pass after fix | accent `#0d8484` 3.99 on panel: bar only |
| linen | light | pass after fix | |
| bloom | light | pass after fix | meta 7.56 (was 4.31) |
| nyan | dark | pass | accent `#ff2ecb`: no glow |
| matrix | dark | pass | accent `#00ff41`: no glow |
| contrast | light | pass | `--line = --border #111111` kept hard |
| volcano | dark | pass | `--line = --border #ffc9a4` kept hard |
| amber | dark | pass | |
| tide | dark | pass | |
| ember | dark | pass | |
| graphite | dark | pass | accent `#d4d4d4` is near-neutral; active bar still ≥ 3:1 |
| vector | light | pass after fix | |

## Security rules touched

None. No IPC, no fs, no crypto, no new dependency, no external link. Panels read
the same stores the sections read today. Received diffs keep their countdown and
purge (`vault.tick()`) unchanged.

## Test plan

- **unit**
  - `tests/renderer/utils/sidebarRecent.test.js`: merges diffs and snippets by
    timestamp, groups Today/Yesterday/This week against a fixed `now`, excludes
    expired and secret-content previews.
  - `tests/renderer/utils/toolGroups.test.js`: every `TOOLS` id lands in exactly
    one job group (fails if a tool is added without a group).
  - `tests/renderer/stores/uiStore.test.js`: `sidebarPanel` defaults to `home`,
    persists, and rejects unknown ids.
  - `tests/renderer/composables/useRailKeys.test.js`: the rail's keyboard
    model (↑/↓ move with wrap, Home/End jump; Enter is the native button);
    event logic stays out of the SFC. (Amended: no ⌘1–4, see Decisions.)
- **theme floors**: `scripts/check-theme-depth.mjs` gains `--text-meta` ≥ 4.5,
  glyph-on-well ≥ 4.5, and card lighter than panel on every light-ground theme.
  Watch each fail on today's tokens first (meta fails on sepia/solar/nord/bloom).
- **e2e**: new `e2e/sidebar-workspace.spec.mjs` covers the rail switching
  panels, Home showing a newly saved diff under Today, Mine/Received switch,
  scoped search, and collapse leaving the rail at its measured width.
- **e2e migration**: 31 specs reference sidebar classes. Each moves to role/label
  locators (`getByRole('navigation', { name: 'Sidebar' })`) as it's touched, so
  the next restyle doesn't break them again. Specs whose feature is removed
  (see Decisions) are rewritten, not skipped.
- **red → green**: the meta-ink floor and the light-ground card floor are the two
  bugs. Their check failures are recorded here before the token change.
- **seed fixtures**: none. No new format or data shape.
- **theme sweep**: add `sidebar-home`, `sidebar-tools` to `SURFACES` in
  `scripts/theme-sweep.mjs`. `make theme-sweep` on all 20.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | yes | Tools row ("their own sidebar section") and both sidebar `alt` texts describe the old layout |
| `docs/screenshots/*.png` | yes | all five frames show the sidebar: `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff` (plus `diagram-diff`) |
| `docs/roadmap.md` | yes | line 412: `.key-actions` width is tied to `--sidebar-w`; the rail changes that measure, so note it under the open item |
| `docs/brand/roadmap.svg` | no | no track moves |
| `docs/*.md` | yes | `standards.md`: the `.tile` exception to the `.btn` keyline rule, and `--text-meta` as the ink for secondary text |

## Implementation plan

- [x] 1. Floors first: add the three checks to `check-theme-depth.mjs`; record
      them failing on current tokens.
- [x] 2. Tokens: `--text-meta`, `--line`, light-ground `--bg-raised`, hues,
      wells, glyphs, `--rail-item`, `--row-h-2`. Floors go green.
- [x] 3. `ui.css`: `.tile`, `.glyph-well`, `.row-2` (two-line row),
      `.seg` (segmented control), shared by every panel.
- [x] 4. `uiStore.sidebarPanel` + `useSidebarPanel` composable (tests first).
- [x] 5. `SidebarRail.vue` becomes the permanent rail: four destinations, counts,
      Keys at the foot, active bar. Collapse hides the panel only.
- [x] 6. `SavedDiffs.vue` becomes the panel host: one panel by `sidebarPanel`;
      scoped search placeholder per panel. Stays ≤ 250 lines.
- [x] 7. `utils/sidebarRecent.js` (pure, tested) + `HomePanel.vue` (Pinned,
      Recent, Quick tools).
- [x] 8. Diffs panel: `SavedDiffsSection` + `ExternalDiffsSection` behind the
      Mine/Received `.seg`; empty Received shows one line + Import.
- [x] 9. Rows: `SavedDiffRow`, `SnippetRow` move to `.row-2` with glyph well;
      star/actions on hover and focus-within only.
- [x] 10. Tools panel: `utils/toolGroups.js` (tested) + `ToolsSection` as
      grouped `.tile`s.
- [x] 11. `SectionHeader` → sentence case, `--text` 600 + count pill.
- [x] 12. e2e: new spec + migrate the 31 to role locators; `make e2e` green.
- [x] 13. Theme sweep surfaces + `make theme-sweep` across 20.
- [x] 14. Docs: README copy + alts, `make screenshots`, roadmap note,
      standards.md exception.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | build E, combining B's rail, C's Home and A's rows | scales past 50 items and keeps a "what was I doing" view | A, B, C, D, F, Hunk (see Solution) |
| 2026-10-23 | signed off: section reorder (`section-reorder`, `sidebar-reorder` specs, `settings.orderedSections`) becomes rail-order reorder | sections no longer stack; the order now means rail order | keep stacked sections behind the rail (two navigation models at once) |
| 2026-10-23 | signed off: tag shelf height drag (`tag-shelf-resize` spec) is removed; the shelf is one line + `+N` popover | a panel-scoped single line replaces the multi-row shelf | keep the resizable shelf inside every panel |
| 2026-10-23 | signed off: `.tile` drops the 3:1 keyline the `.btn` rule requires, on all but the three hard-keyline themes | the keyline is what reads as dated; affordance moves to well + raised + shadow, measured by new floors | keep keyline (fails the "dull" brief) |
| 2026-10-23 | amended step 2: new `--bg-card` instead of redefining `--bg-raised` | `--bg-raised` is used by 19+ surfaces (dialogs, tool panels, viewer bands); changing it would restyle them and fail `raised/canvas` on solar, sepia, … where canvas is `--bg` | redefine `--bg-raised` |
| 2026-10-23 | amended: no Keys rail button in this spec | the toolbar has two buttons (`KeyActions`), not a menu; a rail button would invent UI that belongs with the toolbar follow-up | a Keys button opening a new menu |
| 2026-10-23 | the collapsed rail's per-tool quick buttons are dropped | the rail now holds destinations; tools are one click away in their panel and on Home | keeping a second tool strip under the rail |
| 2026-10-23 | creating a snippet or saving/importing a diff opens the panel holding it (`ui.markNewRow(id, panel)`), Received tab for an imported diff | the new-row marker already promised to show where a new row went; behind another panel it could not | leave the sidebar on whatever panel was open |
| 2026-10-23 | the tour opens Snippets for its snippet steps (`tour-show-snippets`, `tour-clear-filters`) and hands the panel back with the other filters | the steps ring rows that are only in that panel | a panel switch inside each step's copy |
| 2026-10-23 | rail reorder by drag reuses `useSectionReorder`; a rail button opts in as handle with `data-reorder-handle` | one gesture implementation for both | a second reorder composable |
| 2026-10-23 | snippet glyph wells use the floor-checked `snippet` hue, not the language family tint | family tints have no contrast floor; the language stays readable as the well's text | per-family wells |
| 2026-10-23 | no ⌘1–4 rail shortcuts | Ctrl/⌘+1 and +2 are already Open Left / Open Right | rebinding the file-slot shortcuts |
| 2026-10-23 | hover actions overlay the row's right end on a solid `--row-hover`, stopping one star short of the edge; row actions shrink to `--chip-h` | reflowed actions shrank the name until the row's middle was a row action (Export image, Delete) — found by `e2e/snippets.spec.mjs` and the `.stack` clicks in tabs/tooltips/paste-names | a "more" menu (new UI) |
| 2026-10-23 | deleting a tag also drops it from the sidebar filter (`forgetTag`) | a filter on a deleted tag hid every row with no chip left to switch it off | leave the filter to the user's Clear |
| 2026-10-23 | the empty Diffs panel keeps the primary "New comparison" button | `snippets.spec` guards it as the cold-start affordance; in a panel with nothing else it costs nothing | removing it as a toolbar duplicate |
| 2026-10-23 | the tools palette keeps an entry point: a "Search every tool" icon button beside the Tools panel's search | its only entry points were the old section header and rail wrench; removing them would have deleted a feature nobody decided to drop | none |
| 2026-10-23 | `useTagShelfResize` and its test removed; `tagShelfHeight` stays in settings, unread | the grip is gone (signed off); keeping the setting keeps old backups restorable without a migration | migrate the setting away |

## Validation

- [x] `/validate` — 8 findings, all fixed; `quality-audit.md` Open is empty
- [x] `npm run check` — exit 0: style tokens ok (123), theme depth ok (20),
      structure clean, i18n 1335/1335, 3737 passed / 2 skipped, coverage
      95.32 / 88.4 / 95.83 / 96.37, build ok
- [x] UI seen running — `make e2e` 535 passed, 0 failed, 4 skipped (macOS-only);
      `make theme-sweep` (sidebar-home, sidebar-tools, new-row,
      waiting-for-second) 380 measurements over 20 themes, all above floor;
      README frames regenerated and checked by eye
- [x] every Docs-impact "yes" done — README copy + alts, six screenshots,
      roadmap note, standards.md (`.tile`, `--text-meta`, size scale)
- [x] `make local-seed` — n/a, no new format
- [x] token usage measured

### Token usage

| category | tokens |
|---|---:|
| input | 424 |
| output | 188,348 |
| cache write | 365,581 |
| cache read | 127,724,914 |
| **total** | **128,279,267** |

**Red → green, step 1–2** (`node scripts/check-theme-depth.mjs`):
- red, tokens at today's values: `solar: meta/panel 3.99`, `sepia: meta/panel 3.44`, `nord: meta/panel 4.05`; `card/panel 1.00` on 19 themes; `nord: glyph/inspect 2.64` (72% hue ink)
- green: worst `meta/panel 5.41 (sepia)`, `card/panel 1.05 (meridian)`, `glyph/* 4.65 (nord)`; exit 0

**Outcome:** shipped on `improvement/sidebar-workspace`, uncommitted. The rail +
four panels replace the stacked sidebar; seven bugs found on the way (Decisions)
are fixed with tests. Known cost: a crowded tag shelf fits fewer chips beside
the rail (one line at the resting width), reachable through "+N more".
