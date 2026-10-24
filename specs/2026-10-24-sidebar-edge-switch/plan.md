# The window's bottom edge, and Mine / Received as a header

| | |
|---|---|
| **Status** | approved |
| **Progress** | 2 / 2 slices built; 1 merged |
| **Branch** | one per slice; see Delivery |
| **Started** | 2026-10-24 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 3 / 3 |
| **Token baseline** | 2026-10-24T07:39:02Z |
| **Claude tokens used** | — |

## Problem

Two reports from the user's screenshots, both in volcano.

1. **The bottom edge looks cut off.**
   - The rail and the sidebar panel run straight to the window's edge, and
     their dividers meet the rounded window corner.
   - The snippet document ends on an inset, rounded frame 16 px above the
     edge (`.doc-main` padding, `SnippetDocument.css`). The editor and its
     status bar form a card with a bottom radius (`SnippetEditor.css`,
     `SnippetStatusBar.css`).
   - So two columns end at the window and one ends early, on a card. The
     dividers cannot be quietened: on contrast, beacon and volcano
     `--line` is `--border` by contract.
2. **The Mine / Received pill looks out of place** (`DiffsPanel.vue`).
   - It is a compact `SegmentedControl` in a row of its own, between the
     tag filters and the "Saved diffs 0" header.
   - Its accent fill is the loudest thing in the panel, and its counts
     repeat the header's.

## Solution

- **Edge C, everything flush.** The snippet document drops its inset.
  - The editor header is a band ruled off by `--line`.
  - The code runs edge to edge, with no frame.
  - The status bar is flush at the window's bottom edge, ruled by `--line`.
  - Every column now ends at the same line, as the diff view already does.
  - The click-to-edit hover keyline becomes a `--btn-edge` outline drawn
    inside the editor, because there is no frame left to recolour.
- **Switch 1, the header is the switch.** The pill row is removed, and
  Mine / Received become the section header's title.
  - The active choice is `--text` at weight 700, with a 2 px `--accent`
    underline. The underline is a non-text indicator; accent never goes on
    a label.
  - The other choice is `--text-meta`.
  - Counts use the existing count chip.
  - The header's own "+" stays and follows the active list.

| option | why not |
|---|---|
| Edge A: aligned 52 px bottom bands in every column | the user picked C; A adds a sidebar footer with little to say |
| Edge B: one full-width status bar | the user picked C; a second bar under the diff view's own status band |
| Quieter dividers | disqualified on contrast, beacon and volcano, where the hard keyline is the contract |
| Switch 2: full-width neutral segmented control | the user picked 1; it keeps an extra row, and the header still repeats the counts |

## Scope

**In:**
- the snippet document's padding, editor frame, status bar and hover cue;
- the Diffs panel's header and switch.

**Out:**
- the rail and the sidebar panel (already flush);
- the diff view (already ends on `.status-band`);
- the history panel's internals;
- Received's empty state.

## Design

**Source of truth:** https://claude.ai/artifact/VUbeYFYw2JYXhd7HHrPo38
**Approved design:** its "Approved design" page, approved 2026-10-24 ("go with
Edge C design and Switch and Switch 1").

| artboard | shows |
|---|---|
| `Approved-Edge.dc.html` | the snippet document flush: header ruled off, code edge to edge, status bar at the window edge |
| `Approved-Switch.dc.html` | Mine / Received as the header title; with saved diffs, and Received empty |
| `Approved-Sweep.dc.html` | the pair in all 20 themes |

### Theme verdict — all 20

Computed from `themes.css` (`scratchpad/contrast.py`), at the floors
TEXT 4.5, DIM 3, SEPARATOR 1.11.

| theme | ground | active tab | inactive tab | underline | status-bar meta | rule | verdict |
|---|---|---:|---:|---:|---:|---:|---|
| light | light | 15.99 | 10.40 | 4.49 | 11.33 | 1.28 | pass |
| dark | dark | 14.64 | 9.45 | 4.62 | 10.01 | 1.38 | pass |
| solar | light | 12.18 | 6.93 | 4.07 | 7.31 | 1.24 | pass |
| neon | dark | 15.68 | 10.12 | 9.79 | 10.74 | 1.38 | pass; the underline is 2 px, no glow |
| nord | dark | 8.73 | 6.10 | 5.03 | 6.96 | 1.38 | pass |
| sepia | light | 8.55 | 5.43 | 3.81 | 5.88 | 1.22 | pass, lowest meta |
| dim | dark | 12.99 | 8.47 | 7.23 | 8.88 | 1.38 | pass |
| beacon | dark | 19.68 | 15.70 | 9.81 | 16.31 | 14.91 | pass; hard keyline kept |
| meridian | light | 11.64 | 7.56 | 3.99 | 7.78 | 1.24 | pass |
| linen | light | 13.57 | 8.05 | 5.65 | 8.67 | 1.26 | pass |
| bloom | light | 12.80 | 7.56 | 4.34 | 8.18 | 1.26 | pass |
| nyan | dark | 15.04 | 10.80 | 5.45 | 11.39 | 1.36 | pass; no glow |
| matrix | dark | 16.87 | 11.09 | 13.92 | 11.47 | 1.35 | pass; no glow |
| contrast | light | 18.76 | 15.63 | 7.63 | 16.73 | 16.87 | pass; hard keyline kept |
| volcano | dark | 19.98 | 16.14 | 6.50 | 16.63 | 13.45 | pass; hard keyline kept |
| amber | dark | 12.25 | 8.46 | 10.20 | 8.76 | 1.29 | pass |
| tide | dark | 13.51 | 9.48 | 8.69 | 10.26 | 1.41 | pass |
| ember | dark | 13.99 | 10.20 | 8.64 | 10.87 | 1.38 | pass |
| graphite | dark | 14.08 | 10.26 | 11.12 | 10.88 | 1.40 | pass |
| vector | light | 15.75 | 10.17 | 6.36 | 10.97 | 1.28 | pass |

## Security rules touched

None. No IPC, no fs, no crypto, no new dependency, no external link.

## Test plan

- **e2e, slice 1:** `e2e/sidebar-workspace.spec.mjs`.
  - The Mine and Received buttons sit inside the Diffs panel's section header.
  - There is no separate switch row.
  - The pressed one carries the accent underline, measured as a computed
    `box-shadow`.
  - The header's "+" imports while Received is active.
- **e2e, slice 2:** `e2e/snippet-flush-edge.spec.mjs`.
  - The status bar's bottom equals the window's.
  - The editor's left edge equals the document's.
  - The hover cue is a ring over the code (`outline`, inset by `outline-offset`).
- **red → green:** each spec watched failing on `main` first.
- **theme sweep:** `diffs-switch` and `snippet-inline-edit` surfaces, all 20.
- **seed fixtures:** none; no data shape changes.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | no architecture or feature-status change |
| `docs/screenshots/*.png` | yes | the sweep regenerates the snippet and sidebar frames it captures |
| `docs/features.md` | no | it does not describe the pill or the frame |
| `docs/roadmap.md` | no | polish, not a roadmap item |

## Delivery

| # | slice | branch | PR | status |
|---|---|---|---|---|
| 1 | Mine / Received as the header (Switch 1), plus this spec | `improvement/diffs-whose-header` | #83 | merged |
| 2 | Snippet document flush to the edge (Edge C) | `improvement/snippet-flush-edge` | | |

## Implementation plan

- [x] 1. Slice 1: red e2e; a `title` slot on `SectionHeader`; `DiffsWhoseTabs`
      inside it; the pill row removed; sweep surface; PR, CI, merge.
- [x] 2. Slice 2: red e2e; flush padding, frame, status bar and hover ring;
      sweep; PR, CI, merge.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-24 | Edge C and Switch 1 | the user's pick on the canvas | A, B; Switch 2 |
| 2026-10-24 | The switch stays toggle buttons (`aria-pressed`) and is drawn as tabs | tab semantics promise arrow-key roving and a tabpanel; two pressed buttons are what it is | `role="tablist"` without its keyboard contract |
| 2026-10-24 | Mine and Received count what the filter leaves, not the vault totals | the header count already answered "why is this empty" under a filter; the switch takes over that header | totals, which disagree with the list below them |
| 2026-10-24 | One `useDiffRows` for both sections and the switch's counts | the two sections carried identical filter code, and the counts must use the same rule | a third copy in `DiffsPanel` |
| 2026-10-24 | `.count-chip` moves to `ui.css`, inked `--text` | two components need it; `--text-meta` on its face is 4.18 on nord, 4.29 on sepia | a scoped copy; the old meta ink, never measured before |
| 2026-10-24 | The theme sweep repaired so every surface runs | it had rotted: four surfaces still opened the snippet dialog or assumed which panel was open; `trusted-keys` opened a dialog the Keys panel replaced, and `keys-panel` covers it | sweeping only the surfaces this change touches |
| 2026-10-24 | The editor's ring is an `outline` with `outline-offset: -1px`, and the sweep gains an `outline` channel | an inset box-shadow on the area paints under Monaco's positioned layers; an outline paints above them | an inset box-shadow; a border, which would bring the frame back |
| 2026-10-24 | The required hint and the Mermaid preview move above the status bar, keeping their inset | the status bar has to be last for the column to end at the window; framed extras are not the edge | leaving the status bar mid-column |
| 2026-10-24 | The editor header pads by `--space-1` vertically | at `--space-2` the document overflowed 2 px at its minimum size (`snippets.spec` caught it) | a smaller editor floor |
| 2026-10-24 | The sweep gains a `shadow` channel | the underline is an inset `box-shadow`; neither the text nor the border channel can see it | an unmeasured indicator |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] UI seen running
- [ ] Docs-impact "yes" done
- [ ] token usage measured
