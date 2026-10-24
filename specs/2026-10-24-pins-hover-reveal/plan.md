# Pinned tools in Tools, hover that reads, and Show in folder

| | |
|---|---|
| **Status** | draft |
| **Progress** | 0 / 3 slices |
| **Branch** | one per slice; see Delivery |
| **Started** | 2026-10-24 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 2 |
| **Token baseline** | — (taken when the build starts) |
| **Claude tokens used** | — |

## Problem

Three reports from the user, 2026-10-24.

1. **A pinned tool moves on Home but not in Tools.**
   - Pinning (★) a tool puts it in Home's Pinned block (`HomePanel.vue:55`).
   - The Tools panel draws only the job groups (`ToolTiles.vue`,
     `TOOL_GROUPS`), so the pinned tool stays where it was.
   - The star turns on, but nothing else moves. One action means two
     different things in two places.
2. **Controls don't read as controls on hover.**
   - A `.tile` (Tools, Home cards) only steps its lift from `--shadow-1` to
     `--shadow-2` (`ui.css:1210`). On the dark grounds that step is close to
     invisible.
   - Text toggles (`.seg-opt`, `.whose-opt`) change only their ink.
   - `.btn` is fine: its face steps to `--btn-face-hover` and its keyline to
     `--accent` (`ui.css:142`).
   - The standard already says a control must read as one before it is
     touched. Hover is the confirmation, and here it is too faint.
3. **No way to find a saved item on disk.**
   - A saved diff or snippet row has no way to show where it is stored.
   - They are not files of their own. Each is one entry in an encrypted store
     file in the data directory (`vault`, `snippets`; `dataFiles.js`
     `STORE_NAMES`).
   - The only reveal today is Settings ▸ data folder (`datadir:reveal`,
     `appData.js:157`).

## Solution (to be drawn on the canvas, then approved)

- **Pinned first in Tools.** A **Pinned** group heads the Tools panel, in pin
  order, ahead of the job groups.
  - A pinned tool shows there, not also in its job group, so a pin moves the
    tile, the same as on Home.
  - Unpinning returns it to its job group.
  - The panel's search filters the Pinned group too.
- **A hover contract for every clickable surface.** Hover always changes two
  things: the **face** (`--btn-face-hover` or a `--bg-card` step) and the
  **edge or lift**. A shadow step alone is not a hover.
  - `.tile` gains a face step and a `--btn-edge` keyline on hover. The three
    hard-keyline themes already carry an edge.
  - Text toggles gain a `--btn-face` wash.
  - A new theme-sweep channel measures the hover delta, so a too-faint hover
    fails on whichever of the 20 themes it is faint on.
- **Show in folder on a saved diff or snippet row.** It is a row action
  beside Delete. Main reveals that item's store file in the OS file manager.
  - `shell.showItemInFolder` takes a path **computed in main** from the
    `STORE_NAMES` allowlist. The renderer sends only `'vault'` or
    `'snippets'`.
  - That is a fourth reveal site under hard rule 7. It is fenced like the
    other three, and `docs/standards.md` gets the same paragraph.

| option | why not |
|---|---|
| Pinned tools stay in their group, marked by the star alone | the user's report: a pin must move the tile, as it does on Home |
| Hover by shadow only, darker | the lift is the resting cue; on dark grounds `--shadow-2` cannot carry hover alone |
| Show in folder opens the data folder (`openPath`) | lands the user in a folder of a dozen files with nothing selected |

**Open question for approval:** is the folder you want the **app's data
folder** (where the encrypted store lives), or, for a diff of two files on
disk, the **folder of the original files**? The snapshot keeps file names,
not paths, so the second needs the source path stored at save time.

## Scope

**In:**
- Tools panel grouping;
- the hover states of `.tile`, `.seg-opt`, `.whose-opt`, `.rail-item`, row
  actions and Home cards;
- a reveal row action on saved-diff and snippet rows.

**Out:**
- changing what a pin means on Home;
- a per-item file export;
- received diffs: their row already offers export.

## Design

**Source of truth:** a design canvas (to be made: Tools with a Pinned
group, a hover sheet per control in all 20 themes, and the reveal row action).
**Approved design:** none yet. No code before both exist.

### Theme verdict — all 20

To be measured on the canvas from `themes.css`. The new sweep channel holds
the hover face delta to a floor on every theme.

## Security rules touched

- **Rule 7, leaving the sandbox.** Show in folder adds a `showItemInFolder`
  call site.
  - The path is computed in main from the `STORE_NAMES` allowlist.
  - The renderer names a store, never a path.
  - It reveals that one file, never an arbitrary one.
  - `docs/standards.md` rule 7 and `docs/security.md` are updated in the same
    change.
- No new dependency, no network, no crypto change.

## Test plan

- **e2e, slice 1:** pinning a tool moves its tile into Tools ▸ Pinned, and
  unpinning returns it to its group. Red on `main` first.
- **e2e, slice 2:** a computed hover delta on `.tile`, measured, not
  screenshotted. Red first.
- **Theme sweep:** a `hover` channel. Each probe hovers its control and holds
  the face delta to a floor on all 20.
- **e2e, slice 3:** Show in folder calls `showItemInFolder` with the store
  path (stubbed in main). The handler rejects an unknown store name.
- **Unit:** the main-side path resolver, for an allowlisted name, an unknown
  name, and path traversal.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `docs/standards.md` | yes | rule 7 gains the reveal site; the hover contract is written beside the `.btn` and `.tile` rules |
| `docs/security.md` | yes | the new sandbox exit, fenced |
| `docs/features.md` | yes | Tools pinning and Show in folder |
| `docs/screenshots/*.png` | yes | Tools panel and rows, regenerated by the sweep |
| `README.md` | no | no feature-status change |

## Delivery

One PR per design change, each deployable alone.

| # | slice | branch | PR | status |
|---|---|---|---|---|
| 1 | Pinned group in Tools | `fix/tools-pinned-group` | | |
| 2 | Hover contract and sweep channel | `improvement/hover-contract` | | |
| 3 | Show in folder | `feat/show-in-folder` | | |

## Implementation plan

- [ ] 0. Design canvas → Approved design page signed off by the user.
- [ ] 1. Slice 1.
- [ ] 2. Slice 2.
- [ ] 3. Slice 3.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-24 | Spec only; no code until the canvas is approved | the user asked for a spec now and the build later, on its own branch | building alongside the v0.13.0 release |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] UI seen running
- [ ] Docs-impact "yes" done
- [ ] token usage measured
