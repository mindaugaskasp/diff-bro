# Recent tools on the collapsed rail

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 8 / 8 steps |
| **Branch** | `feat/diagrams-snippets-rail` (one commit per spec; planned as `feat/rail-recent-tools`) |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 2 / 2 |
| **Token baseline** | 2026-08-02T11:25:38Z |
| **Claude tokens used** | 34,995,569 (mostly cache read) |

## Problem

Collapsing the sidebar costs you the tools. The rail
(`components/SidebarRail.vue`) keeps every section reachable — search, saved
diffs, external diffs, snippets, each with its count — but its one tools control
emits `expand('tools')`, so reaching Base64 or JSON means re-opening the sidebar,
using the tool, and collapsing again. The recents are already tracked
(`settings.recentTools`, `utils/tools.js:47`) and already rendered as chips in
the expanded shelf; the rail just cannot show them.

## Solution

The rail's bottom becomes the tools corner: up to nine recent tools as icon
buttons under the same rule the search band carries, above the flexible gap — so
the expand and wrench controls keep the exact positions they had. A click runs
`diff.handleMenuAction(tool.action)` — the same call the expanded shelf makes —
so the tool opens with the sidebar still collapsed, which is the whole point.

`MAX_RECENT_TOOLS` currently means both "how many we remember" and "how many the
shelf draws", and it is 3 — so the rail could never show five. It splits:

| constant | meaning | value |
|---|---|---|
| `MAX_RECENT_TOOLS` | how many are remembered and persisted | 9 |
| `SHELF_RECENT_TOOLS` | what the expanded shelf draws (its chips carry labels and wrap) | 3 |

`recentTools(ids, limit = MAX_RECENT_TOOLS)` takes the limit; the shelf passes
its own, the rail takes the default.

| option | why not |
|---|---|
| Raise `MAX_RECENT_TOOLS` to 9 everywhere | the shelf's 3 is a measured fit — its chips carry a label and wrap at 4 (`utils/tools.js:30`) |
| A second constant read only by the rail, storage left at 3 | storage would cap what the rail can ever show; the number remembered has to be ≥ the largest surface |
| Put the recents at the TOP of the rail | the tools corner is already the bottom; splitting tools across both ends is a worse map |

## Scope

**In:** the constant split, the limit parameter, the rail's recents block and
hairline, and the shrink behaviour that keeps the wrench on screen in a short
window.

**Out:**

- **Reordering / pinning** which tools appear. Recents are recency, as today.
- **The expanded shelf's count.** It keeps its measured 3.
- **A tools flyout on the rail.** The wrench already opens the full list.

## Design

```
 ┌────┐
 │ ›  │  toggle          .rail-band (--band-row)
 ├────┤
 │ ⌕  │  search
 │ ▣13│  saved diffs
 │ ⧉ 4│  external
 │ ⟨⟩28│ snippets
 │    │  .rail-gap (flex: 1)
 │ ── │  hairline — color-mix(--border 55%, transparent), inset to 18px
 │ ⌗  │  ≤ 5 recent tools, most-recent-first
 │ …  │
 │ 🔧 │  Tools → expands to the shelf
 └────┘
```

- The buttons are the rail's existing `.rail-btn` (already `--control-h` square,
  hover/focus styled) with `<AppIcon :name="tool.icon" />` — no new control size
  and no new class.
- The hairline is a separator, never a removed border: it ADDS a rule where
  there was none, so `contrast` (`#111111`) and `beacon` (`#e0e0e0`) keep every
  keyline they carry. Inset rather than full-bleed, because it separates icons
  and not panels.
- Icon-only, so each button carries `aria-label` as well as `data-tip` — the
  `ui-affordances` e2e asserts exactly that for every icon button.
- The recents block is the one thing allowed to shrink (`min-height: 0;
  overflow: hidden`), so a short window clips a recent tool rather than pushing
  the wrench — the way into every tool — off the bottom.

### Theme verdict — all 14

The hairline is the only new pixel. It reads `--border` on the sidebar's
`--bg-panel`, so it re-tints per theme; at 55% it is deliberately quiet on the
low-contrast grounds and stays legible on the two keyline themes.

| theme | ground | verdict | note |
|---|---|---|---|
| light | light | pass | `#bcc0c0` on `#eeefef` — quiet, as asked |
| dark | dark | pass | `#30363d` on `#161b22` |
| solar | light | pass | `#e7d6ac` on `#fbf2dd` |
| neon | dark | pass | `#26344f`; no accent involved, so nothing haloes |
| nord | dark | pass | `#4c566a` on `#3b4252` |
| sepia | light | pass | `#c3ad7e` on `#dfcea6` |
| dim | dark | pass | `#3a352b` on `#232019` |
| beacon | dark | pass | `#e0e0e0` on `#0b0b0b` — the loudest of the 14, correct for a theme whose contract IS the keyline |
| meridian | light | pass | `#c7d0c8` on `#eef2ee` |
| linen | light | pass | `#d8cfba` on `#efe9dc` |
| bloom | light | pass | `#ddccd2` on `#efe4e7` |
| nyan | dark | pass | `#7a3fa6` on `#231033` |
| matrix | dark | pass | `#1f7a3a` on `#061309` |
| contrast | light | pass | `#111111` on `#f2f2f2` — hard, deliberately |

## Security rules touched

None of the eight. No IPC, no fs, no crypto, no dependency, no external link, no
injection sink. `handleMenuAction` is the same renderer-side dispatch the shelf
and the palette already use.

## Test plan

- **unit — `tests/renderer/utils/tools.test.js`**: `recentTools` honours an
  explicit limit and defaults to `MAX_RECENT_TOOLS`; `noteRecent` remembers five,
  most-recent-first, deduped; `SHELF_RECENT_TOOLS` still bounds the shelf.
- **unit — `tests/renderer/stores/settingsStore.test.js`**: five ids survive the
  persist → read round-trip (the cap lives in `readState` too, so a stale 3-cap
  there would silently starve the rail).
- **e2e — `e2e/sidebar-collapse.spec.mjs`** (existing file): with the sidebar
  collapsed, five used tools appear on the rail, and clicking one opens the tool
  **with the sidebar still collapsed** — the assertion that carries the feature.
- **red → green** — each watched failing first.
- **seed fixtures** — none.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | the collapsed rail is not described there; this refines an existing surface rather than adding a feature to the table |
| `docs/screenshots/*.png` | no | every captured frame has the sidebar expanded |
| `docs/roadmap.md` | no | closes no tracked item |
| `docs/brand/roadmap.svg` | no | board unchanged |
| `docs/*.md` | no | no IPC, crypto, term or convention change |

## Implementation plan

- [x] 1. Branch `feat/rail-recent-tools`, record the token baseline.
- [x] 2. `tools.test.js` for the limit parameter and the split constants — red.
- [x] 3. Implement in `utils/tools.js`; `ToolsShelf` passes `SHELF_RECENT_TOOLS`.
- [x] 4. `settingsStore.test.js` round-trip of five (red → green).
- [x] 5. `SidebarRail.vue` + `SidebarRail.css`: recents, hairline, shrink.
- [x] 6. e2e in `sidebar-collapse.spec.mjs`.
- [x] 7. Docker screenshot sweep of the rail.
- [x] 8. `npx prettier --write`, `npm run check`, audit.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | Storage remembers 5, the shelf draws 3 | the number remembered must be ≥ the largest surface, and the shelf's 3 is a measured fit for labelled chips | one constant for both |
| 2026-08-02 | Recents sit at the BOTTOM, with the wrench | the rail already has a tools corner; splitting tools across both ends is a worse map | putting them under the section icons |
| 2026-08-02 | The recents block shrinks, nothing else | in a short window a clipped recent tool is recoverable, a clipped wrench is not | letting the column overflow as it does today |

## Amendments during the build

Seven, all from seeing it running — this feature was designed at the screenshot,
not on paper:

1. **The expand control appeared to have moved.** Inserting the recents between
   it and the wrench left it floating mid-column. The recents moved ABOVE the
   flexible gap instead, so expand and wrench sit exactly where they always did
   and the rule separates recents from the section icons.
2. **Five became nine.** There was visible room; the registry ships twelve tools,
   so nine recents still leaves the list meaning something.
3. **The wrench opens the tools palette** (`diff.openToolsPalette()`) instead of
   expanding the sidebar. It was the one control on a collapsed rail that
   undid the collapse — and it is the same searchable list the shelf offers.
4. **The rule is the band's line, not a dimmed one.** `1px solid var(--border)`
   at full width, identical to the search band's `border-bottom`, so the rail
   reads as one strip with two rules. The original 55% mix was too faint on the
   light grounds.
5. **The toggle moved into the top band** (reported twice as "the expand button
   fell off"). It now sits on the same line the expanded sidebar's collapse
   control does, and an e2e measures that: the two centres are within 3px, and
   it is in the top quarter of the rail.
6. **The band grew by the tab strip** (`--control-h + 1px`), so its rule lands ON
   the line under the file slots instead of 31px above it — the "the side looks
   detached" report. The band grows DOWNWARD: the toggle keeps the position
   `--band-row` centring gave it, so amendment 5 still holds.
7. **The tools fit the window.** A measured count (`utils/railFit.js` +
   `composables/useFittingCount.js`, a ResizeObserver over the block that takes
   the leftover column) replaced the fixed nine, so a tall window fills and a
   short one never clips an icon in half. The wrench also got its
   `padding-bottom` — it was glued to the floor.

## Validation

- [x] `npm run check` — `style tokens ok (91 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `116 passed | 1 skipped` files,
      `1717 passed | 2 skipped` tests
- [x] e2e — `e2e/sidebar-collapse.spec.mjs` 15 passed, including six new cases:
      a recent tool opens with the sidebar still collapsed; nine are remembered
      and the oldest falls off; the wrench opens the palette; the toggle keeps
      its position across states; the rail rule lands on the file-slots line; the
      tool count follows the window and re-fits on resize. FULL suite
      `277 passed, 2 skipped` (6.4 m)
- [x] UI seen running — the rail captured on light, dark and contrast after the
      layout correction
- [x] `make local-seed` — n/a
- [x] token usage measured

**Red → green recorded:** `tools.test.js` 2 failures (no limit parameter,
`MAX_RECENT_TOOLS` still 3) → 21 passed. The settings round-trip passed on
arrival, so it was proven by hand: hardcoding `slice(0, 3)` in `readState` made
it fail (`expected [uuid, lines, xml] to deeply equal [...5]`), and restoring the
constant made it pass. Two OLDER tests then failed for a good reason — they
filled a 3-slot list with six tools and asserted it was full; both were rewritten
to overflow whatever the cap is, so the next change to it cannot silently pass.

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since 2026-08-02T11:25:38Z
```

| category | tokens |
|---|---:|
| input | 134 |
| output | 51,139 |
| cache write | 86,809 |
| cache read | 34,857,487 |
| **total** | **34,995,569** |

**Outcome:** shipped, but the plan was only half the design — seven amendments
came from looking at it running, and two of them (the toggle's position, the
band's alignment with the file-slots line) were defects a reader would have
noticed before any test did. Both are now measured invariants rather than
screenshots. The two bugs counted in the header are those.
