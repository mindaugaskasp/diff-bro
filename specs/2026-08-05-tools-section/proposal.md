# Tools section — redesign proposal

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| **Status**   | proposed, not built — needs one decision before it starts                       |
| **Raised**   | 2026-08-05, from the sidebar work on `feat/onboarding-tour`                     |
| **Artifact** | <https://claude.ai/code/artifact/8c17c6aa-0db8-40d6-b168-bfaca9f80d82>          |
| **Scope**    | `ToolsShelf.vue`, `SidebarRail.vue`, `utils/tools.js`, `SavedDiffs.vue`, tokens |

The artifact carries the same argument with the 14 mockups and the full contrast
table. This file is the durable copy: the artifact is a link, this is in the repo.

## The recommendation

**Tools becomes the fourth sidebar section and the footer is deleted.** Same
`SectionHeader` as Saved / External / Snippets — collapsible, drag-reorderable,
filtered by the sidebar search that already reaches every other section. Six rows
at rest plus a "6 more tools" disclosure. **Pins replace recents for ordering:**
recency decides membership, never position.

## The evidence

Verified against the source, not taken on trust:

| defect                                                                                     | where                                          |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Chip is **23.75px** — `--font-xs` 10.5 × 1.5 + 6 padding + 2 border. Not 30, 26 or 20.     | `ToolsShelf.css` `.usb-tool` (no height set)   |
| Chip face is `--bg`, so it reads **raised on the 7 light grounds, recessed on the 7 dark** | `ToolsShelf.css:66`                            |
| It owns **5 of the app's contrast-debt entries**                                           | `scripts/theme-pair-baseline.json`             |
| The strip **jumps 52px → 114px** the first time any tool is used, permanently              | `.usb-tools` + the `v-if="recent.length"` gate |
| **The rail shows 9 tools, the expanded sidebar 3** — collapsing shows you more             | `MAX_RECENT_TOOLS` 9 vs `SHELF_RECENT_TOOLS` 3 |
| Recents **reorder under the cursor** on every use, so muscle memory cannot form            | `noteRecent` moves the used id to the front    |
| 12 tools registered, 3 reachable from the shelf                                            | `utils/tools.js`                               |

**Not re-verified by me:** the 14-theme contrast table in the artifact (row label,
kind, icon and pin against each panel). It was produced by parsing `themes.css`
and reproduced the five existing baseline numbers exactly, which is good evidence
it is calibrated — but a second pass belongs in the build, not before it.

## The design

- `ToolsSection.vue` reusing `SectionHeader` (chevron, identity icon, count chip,
  actions slot, drag-reorder) and `.btn .btn-icon` for the pin and header action.
- Rows are `--control-h-sm` with **no fill of their own**, so they inherit the
  panel and never flip depth between grounds — the fix for the chip's inversion.
- `toolRows({ pinned, recent, limit })` in `utils/tools.js`, pure: pinned first,
  then everything else, **both in registry order**. Permuting `recent` must not
  change the output — that is the load-bearing test.
- Pins persist under their own key via `useToolPins`, the same precedent
  `useSidebarResize` sets (`settingsStore` is pinned at exactly 308 lines).
- A new `--pin-ink` token: a bare `--favorite` star fails six themes against the
  panel (2.23 solar, 2.62 sepia, 2.73 light), so it mixes 70% toward `--text`,
  and state is encoded twice — ink and a filled-vs-outline star.
- The rail uses the same `toolRows`, so the two surfaces finally agree.

## Rejected

| option                            | why not                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Repaint the footer                | Leaves the permanent cost, the seam jump, the 3-of-12 ceiling and the inversion    |
| Delete it; palette and menu only  | The sidebar is expanded by default, so tools become rail-only for most people      |
| Tools in the top toolbar          | That bar is per-comparison; tools are global and 12 fit at no window width         |
| A 12-tile icon grid               | ≈120px permanent, and icon-only is unreadable across an abstract glyph set         |
| Keep recents **and** add pins     | Two orderings in one 256px column, and the recents half still moves under you      |
| Sort the six by recency           | The whole point — recency decides membership, position stays put                   |
| A search field inside the section | The control just mistaken for a search input; the sidebar search already reaches   |
| Pins in `settingsStore`           | Pinned at 308 lines by the size ratchet; one line over fails the build             |
| A `features/tools/` slice         | The registry is imported by core — the cycle `check-structure.mjs` exists to catch |

## Cost

Three new files, two deleted, seven touched. `SavedDiffs.vue`'s script goes
**91 → ~93 of 100** — the tightest cap in the change. Five contrast-debt rows
leave `theme-pair-baseline.json`; a `--pin-ink` ratchet row joins
`check-theme-depth.mjs`; `theme-sweep.mjs` gains a `tools-section` surface with a
**hovered** probe, because the sepia icon failure only exists in that state.

## The decision needed first

**Does the footer-alignment e2e go?** `spreadsheet.spec.mjs` asserts
`.usb-tools-search` shares a top edge and height with `.status-band`. With no
footer there is nothing to align.

- **For deleting it:** a 52px permanent strip whose structural job is making a
  line match is the tail wagging the dog, and the bug it guards is removed at the
  root rather than hidden.
- **Against:** that misalignment was a real reported defect, fixed on 2026-08-04.
  If the seam is worth keeping, the honest fix is a full-width status band
  beneath both columns — a separate change, not a reason to keep a tools footer.

Nobody should start building until this is answered.

## Picking it up

1. Answer the question above.
2. Re-derive the contrast table against `themes.css` — do not trust the artifact's.
3. Write `toolRows`' permutation test first and watch it fail against a naive
   recency-ordered implementation.
4. `sanitizeSectionOrder` migrates existing 3-element orders when `SECTIONS`
   grows — that is the one thing that breaks silently for existing users.
