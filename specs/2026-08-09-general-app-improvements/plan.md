# General app improvements — eight small cuts

|                                         |                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| **Status**                              | shipped                                                                            |
| **Progress**                            | 13 / 13 steps                                                                      |
| **Branch**                              | `improvement/general-app-improvements`                                             |
| **Started**                             | 2026-08-09                                                                         |
| **Finished**                            | 2026-08-09                                                                         |
| **Bugs found and fixed this iteration** | 7 / 7                                                                              |
| **Token baseline**                      | 2026-08-09T11:42:21Z                                                               |
| **Claude tokens used**                  | 89,231,961 (measured; cache read 88.3M dominates — tokens processed, not produced) |

Eight independent improvements, one spec: none is big enough to carry a spec
alone, and they touch disjoint files, so one branch ships them together.

## Problem

1. **The snippet row's hover Capture button crowds out Copy.**
   `SnippetRow.vue:196-204` shows an image-export button on every non-secret
   row. Capture is a rare action; Copy is the row's whole point, and Capture
   already lives where you are _looking at_ the thing you want a picture of —
   the view-mode action row (`SnippetEditorActions.vue:135-142`).
2. **Edits are destructive.** `snippetStore.update()` overwrites `iv`/`data`;
   the previous content is gone. `updatedAt` was added as "groundwork for
   snippet history" (`snippetStore.js:229-230`) and nothing was ever built on
   it. A bad paste-over loses work with no way back.
3. **The tag shelf's depth is buried in Settings.** `tagShelfRows`
   (Settings ▸ Limits, floor 2 / cap 12) exists, but adjusting how many tags
   show before "+41 more" means a round trip through a dialog for what is a
   direct-manipulation decision — the sidebar's _width_ already resizes by
   drag (`useSidebarResize.js`).
4. **The hover preview card shows the contents but cannot copy them.**
   `SnippetPreviewCard.vue` is exactly where "is this the one?" gets answered,
   and the only actions offered are Open in editor / View full screen. Copy
   means travelling back to the row's hover buttons.
5. **A tool dialog opens as a bare input.** `TextToolDialog` renders the panel
   with no statement of what the tool does — ToolJson greets a first-time user
   with "Paste JSON" and no hint of what pasting buys (pretty/minify/sort/
   JSONPath). Same for Base64, JWT, Lines, Hash, Regex.
6. **Settings scroll content sits against the scrollbar.**
   `.settings-pane { scrollbar-gutter: stable; padding-right: var(--space-3) }`
   (`SettingsDialog.css:58-69`) — the right-aligned controls (number inputs,
   toggles) still crowd the bar.
7. **A pane that scrolls does not look like it scrolls.** The app-wide
   scrollbar thumb is `var(--border)` on a transparent track
   (`base.css:27-51`) — on several themes that is a whisper, and a Settings
   pane taller than 380px (Storage today) gives no cue that content continues
   below the fold.
8. **No Linux artifact ever reaches a release.** `electron-builder.yml:87-98`
   configures `AppImage` + `deb` (maintainer set, sandbox notes written) and
   `build:linux` exists in `package.json`, but `release.yml`'s build matrix
   has only `windows-latest` and `macos-latest` — the Linux config is dead
   code and the releases page has nothing for Ubuntu/Debian.

## Solution

Eight cuts, each the smallest change that resolves its problem. Rejected
alternatives:

| option                                                         | why not                                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep row Capture behind a modifier key or overflow menu        | invisible affordances on a 4-button hover row; view mode already owns Capture                                                                                                           |
| Full plaintext version store (separate file per version)       | duplicates the vault model; versions belong beside the entry, same AAD, same crypto path                                                                                                |
| Restore-from-history in this iteration                         | user asked for view/tracking; restore is a copy-paste away (diff dialog → Copy), and doing it properly (a new version, not a silent overwrite) is its own small spec                    |
| Content hash in metadata to detect no-op saves                 | a plaintext hash beside encrypted content invites dictionary attacks on secrets; the draft composable already knows whether content changed                                             |
| Independent pixel `max-height` for the tag shelf               | second source of truth beside `tagShelfRows`; the drag turns that one knob _(the Settings row exposing it was later removed — see Decisions — leaving the grip as the only affordance)_ |
| Tool description as placeholder text                           | dies the moment typing starts, exactly when the segmented controls appear and need explaining                                                                                           |
| Tool description as a dismissable first-run coachmark          | state to persist, code to dismiss, and the second-time user loses the reminder; one dim line costs 18px                                                                                 |
| `overflow-y: scroll` (always-on bar) for Settings              | shows a dead track on the seven panes that fit; the cue should exist only when there is something below                                                                                 |
| Linux build in the existing macOS/Windows job via multi-target | electron-builder cross-builds Linux poorly (deb tooling); a native `ubuntu-latest` matrix row is the supported path and mirrors the other two                                           |

## Scope

**In:**

1. Remove the Capture button from the snippet row's hover actions.
2. Snippet version history: record superseded content on edit, view any
   version's diff against its predecessor from the snippet view window.
3. Drag-to-resize the sidebar tag shelf (writes `tagShelfRows`). _(Amended
   mid-build, user's call: the Settings ▸ Limits row for it is REMOVED — the
   grip is the only affordance; the setting persists invisibly behind it.)_
4. Copy button in the hover preview card.
5. One-line description in every tool dialog (+ richer sidebar tooltip).
6. More air between Settings content and its scrollbar.
7. A scrollbar that is visibly present when a Settings pane overflows.
8. Linux (`.deb` + AppImage) artifacts in the release workflow + README row.

**Out** _(recorded, not drifted into)_:

- Restoring a historical version (view-only this iteration; contents are
  copyable from the diff).
- History for saved diffs / vault entries — snippets only.
- History size accounting in Settings ▸ Storage (cap bounds it; revisit if the
  cap ever rises).
- Quick Look preview pane copy button — Quick Look already copies on Enter.
- apt repository / PPA — GitHub Releases artifact only, like the other OSes.
- Snap/Flatpak targets.

## Design

All token-driven; no new colours, no bespoke control boxes. New-surface probes
added to `theme-sweep` `SURFACES` where marked.

- **Row actions (1)** — deletion only. The row keeps star / type action /
  copy / delete; nothing new to style.
- **History dialog (2)** — a `BaseDialog` (`width` prop, standard chrome).
  Left rail: version rows (timestamp + relative age, `--text` / `--text-dim`,
  active row `--bg-hover` like `.nav-item`). Right: read-only Monaco diff
  (Monaco is themed by `useMonacoTheme` already). The History button in the
  view-mode action row is a plain `.btn` `.btn-sm` with `<AppIcon
name="clock">` — a neutral action beside a primary (Edit), so not
  `.btn-ghost`. Secret snippets open masked (`SnippetSecretMask`) with the
  same Show/Hide toggle the editor uses.
- **Tag shelf grip (3)** — a horizontal twin of `.usb-grip`: 4px hit strip on
  the shelf's bottom edge, `cursor: row-resize`, unmarked at rest, hover/drag
  tint `color-mix(in srgb, var(--accent) 45%, transparent)` — the exact
  treatment the sidebar's width grip ships today, so the accent-halo themes
  (matrix/nyan/neon) are already proven on it.
- **Preview card Copy (4)** — a second `.pv-open`-class button in `.pv-foot`,
  `<AppIcon name="copy">`, label swaps to "Copied" via the existing
  `useCopyFeedback` flash. Sits before Open in editor; both quiet footer
  buttons, an existing shipped style.
- **Tool description (5)** — one dim line under the dialog header:
  `font-size: var(--font-sm); color: var(--text-hint)`, margin from the
  spacing scale. `--text-hint` is the token every theme already holds to the
  hint floor (`check-theme-depth`). **theme-sweep probe added**: description
  line on the dialog surface.
- **Settings gutter (6)** — `.settings-pane` `padding-right` steps
  `--space-3` → `--space-5`. No new tokens.
- **Settings scrollbar (7)** — scoped to `.settings-pane` (app-wide bars are
  deliberately quiet; the _finding_ was scoped to Settings):
  thumb `color-mix(in srgb, var(--text) 28%, transparent)`, track
  `color-mix(in srgb, var(--text) 8%, transparent)` — derived from `--text`
  for the same reason `.usb-tags::before` is (`SavedDiffs.css`: border-derived
  hairlines vanish on light grounds). Both Chromium pseudo-elements and
  `scrollbar-color` set. **theme-sweep probe added**: thumb vs pane.
- **Release (8)** — no UI surface.

### Theme verdict — all 20

Parsed from `styles/themes.css` (the working tree ships 20 themes now — the
template's 14 predates volcano/amber/tide/ember/graphite/vector). Ground is
`--bg`, not the name. Every new surface is composed from `--text`,
`--text-hint`, `--bg-hover`, `--accent` mixes and BaseDialog chrome, so the
verdict per theme is about the mixes, not new literals.

| theme    | ground (`--bg`) | `--text`  | `--accent` | verdict | note                                                                                                |
| -------- | --------------- | --------- | ---------- | ------- | --------------------------------------------------------------------------------------------------- |
| light    | light `#ffffff` | `#141414` | `#c2410c`  | pass    | floating-canvas inversion; text-derived thumb reads on the tinted canvas too                        |
| dark     | dark `#0d1117`  | `#e6edf3` | `#2f81f7`  | pass    |                                                                                                     |
| solar    | light `#fffdf6` | `#3a2c0f` | `#cb4e0a`  | pass    |                                                                                                     |
| neon     | dark `#090d18`  | `#e9f2ff` | `#22d3ee`  | pass    | accent only on the grip tint — 45% mix, the shipped sidebar-grip treatment                          |
| nord     | dark `#2e3440`  | `#eceff4` | `#88c0d0`  | pass    |                                                                                                     |
| sepia    | light `#e9dcbe` | `#3a2e15` | `#9c4f1f`  | pass    | 28% text-mix thumb ≈ the shelf hairline already proven here                                         |
| dim      | dark `#1b1917`  | `#ece5da` | `#d9a441`  | pass    |                                                                                                     |
| beacon   | dark `#000000`  | `#ffffff` | `#4cc2ff`  | pass    | hard keyline `#e0e0e0` contract untouched — no border removed or softened anywhere                  |
| meridian | light `#f5f7f4` | `#263238` | `#0d8484`  | pass    |                                                                                                     |
| linen    | light `#faf7f0` | `#221f1a` | `#3f5b8a`  | pass    |                                                                                                     |
| bloom    | light `#f9f4f5` | `#2a1f26` | `#b0446e`  | pass    |                                                                                                     |
| nyan     | dark `#160a20`  | `#f4e9ff` | `#ff2ecb`  | pass    | high-chroma accent stays on the grip mix, never a glow or label                                     |
| matrix   | dark `#020a04`  | `#c6ffd2` | `#00ff41`  | pass    | same                                                                                                |
| contrast | light `#ffffff` | `#000000` | `#1633d4`  | pass    | hard keyline `#111111` contract untouched; text-mix thumb is near-black on white — strongest of all |
| volcano  | dark `#000000`  | `#ffffff` | `#ff5c33`  | pass    | beacon's warm twin, same keyline logic                                                              |
| amber    | dark `#0f0a02`  | `#ffc95e` | `#ffb000`  | pass    | monochrome phosphor: every mix derives from the amber text, stays in-palette by construction        |
| tide     | dark `#0b1a1e`  | `#e2f1f2` | `#6ed2c0`  | pass    |                                                                                                     |
| ember    | dark `#1a1013`  | `#f3e7e9` | `#ffa285`  | pass    |                                                                                                     |
| graphite | dark `#161616`  | `#ededed` | `#d4d4d4`  | pass    | achromatic accent — grip tint is a grey lift, still ≥ the hover treatment it mirrors                |
| vector   | light `#ffffff` | `#12181f` | `#0b57a4`  | pass    |                                                                                                     |

The build gate is
`npm run check:themes` + `make theme-sweep` with the two new probes — the
table is the design-time check, the sweep is the proof.

## Security rules touched

- **Rule 1 (offline)** — untouched. The release-workflow change is CI-only;
  the deb config already carries the sandbox note (`electron-builder.yml:92-94`:
  no `--no-sandbox`, chrome-sandbox ships SUID).
- **Rule 3/4 (renderer split, keys)** — history reuses `vault:encrypt` /
  `vault:decrypt` through the existing seam; **no new IPC handler**, no key
  material moves. Superseded ciphertext keeps the entry's AAD
  (`id|aadSalt|createdAt` — all immutable), so old boxes decrypt without any
  crypto change. `sealing.js` / `vaultCrypt.js` are not touched.
- **Rule 6 (hostile input)** — `migrate()` gains a `history` shape check
  (array of `{savedAt, iv, data}`, capped) like every other field it validates.
- **Rule 7 (sandbox exits)** — none added.
- Rules 2, 5, 8 — no new dependency, no crypto change, no new render sink
  (all new text renders via interpolation).

Bundles (`_bundle`) deliberately **exclude history** — an export is the
current content, and a shared file must not smuggle a snippet's past edits.

## Test plan

Items 6 and 7 are visual defects → **e2e first, watched failing** per the
bug-fix rule. The rest are behaviour changes with tests in the same change.

- **unit**
  - `tests/renderer/stores/snippetHistory.test.js` — edit pushes the _old_
    box with the old `updatedAt`; cap drops oldest; name/tag-only edit records
    nothing; unchanged content records nothing; `migrate()` defaults and
    rejects malformed history; bundle excludes history.
  - `tests/renderer/composables/useTagShelfResize.test.js` — drag delta →
    row count (row-height quantised), clamps 2–12, writes through
    `settings.setLimit`, persists on release not per-frame.
  - `tests/renderer/composables/useSnippetPreview.test.js` — extend: copy
    action loads + copies, routes claude-with-vars to the fill dialog,
    flashes only on `copyText` ok.
  - `tests/renderer/utils/tools.test.js` — extend: every registry row carries
    a `descKey` (the same guard `commands.test.js` gives actions).
- **e2e**
  - `e2e/settings.spec.mjs` — extend, **red first**: (a) computed
    `padding-right` of `.settings-pane` ≥ `--space-5`; (b) on the Storage
    pane, `scrollHeight > clientHeight` ∧ `offsetWidth − clientWidth > 0`
    (a visible bar takes layout width) ∧ computed thumb colour is not the
    old `--border` value.
  - `e2e/snippet-history.spec.mjs` — new: create, edit twice, open History
    from view mode, two versions listed, diff pane shows the change; secret
    snippet opens masked.
  - `e2e/snippet-image.spec.mjs` — update: capture drives via view-mode
    Capture (the row button is gone); assert the row renders no capture
    control.
  - `e2e/snippets.spec.mjs` or new — hover preview → Copy → clipboard holds
    the content (X11 display per worker, existing harness).
  - `e2e/sidebar-reorder.spec.mjs` untouched; tag-grip drag asserted in a
    small extension to `e2e/tag-delete.spec.mjs`'s fixture or its own spec —
    drag down one row-height, chip count grows by `TAGS_PER_ROW`, relaunch
    keeps it (persistence).
- **red → green** — recorded per test in Validation when run.
- **seed fixtures** — none change: no new format, no data-shape change that
  `seed-local.mjs` ships. History exercises the same snippet entries the seed
  already creates.

## Docs impact

| surface                  | needed?                 | what changes                                                                                                                                                                                           |
| ------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | **yes**                 | Install table gains a Linux row (`.deb` / AppImage, version-stamped names); hero alt covers Linux; feature table's Snippets row mentions version history                                               |
| `docs/screenshots/*.png` | no                      | the five captured states show no hover action row, no open Settings, no tag-shelf grip (invisible at rest); nothing captured restyles                                                                  |
| `docs/roadmap.md`        | no _(amended from yes)_ | the board has no snippets track and none of these items ever sat on it — nothing moves open → done; a new track for a shipped feature is decoration                                                    |
| `docs/brand/roadmap.svg` | no _(amended from yes)_ | follows the .md verdict                                                                                                                                                                                |
| `docs/*.md`              | no                      | no security posture, IPC surface, or glossary term changes; standards.md untouched (the 14-theme figure there is a separate staleness, noted for a docs-only follow-up, not smuggled into this change) |
| `docs/packaging.md`      | **yes**                 | Linux artifact row (names, no signing, SUID sandbox note already in electron-builder.yml)                                                                                                              |

## Implementation plan

- [x] 1. `SnippetRow.vue` — remove the Capture button; update
      `e2e/snippet-image.spec.mjs` (capture via view mode; row asserts no
      capture control).
- [x] 2. History data layer: `utils/snippetHistory.js` (recordVersion /
      validHistory / versionRows, `MAX_SNIPPET_HISTORY = 20`) +
      **`stores/snippetHistory.js`** (`loadVersion`, spread into the store
      like `tagActions` — `snippetStore.js` sits at its size ratchet);
      `entryAad` moved to `utils/snippetState.js` so both sides share it
      without a store cycle; `migrate()` shape guard. Unit tests red → green
      (17 tests).
- [x] 3. `useSnippetDraft` passes `contentChanged` to `update()`; name/tag/
      secret-only edits record no version.
- [x] 4. `SnippetHistoryDialog.vue` (+ `styles/SnippetHistoryDialog.css`) —
      BaseDialog, version rail, read-only Monaco diff of selected vs
      predecessor via `useMonacoDiffPane`; secret → masked with reveal
      toggle. History button lives in `SnippetEditorActions` view mode
      (hidden when no history; wired there, not through the parent — the
      editor dialog's script block is at its cap). `e2e/snippet-history.spec.mjs`.
- [x] 5. Tag shelf: `useTagShelfResize` (window-bound listeners, quantised
      to measured rows, writes `setLimit('tagShelfRows', n)` on each row-step
      crossing — live feedback, bounded writes) + grip in `SavedDiffs.vue`/
      `.css`. Unit (6) + `e2e/tag-shelf-resize.spec.mjs`. _(Amended with scope
      item 3: the Settings row is gone, so the e2e proves drag + grip-hugs-edge + relaunch persistence instead of the original "Settings number follows".)_
- [x] 6. Preview card: Copy in `.pv-foot`; logic in
      `useSnippetPreviewActions.js` (openEditor/openDiagram/copyPreview split
      out — `useSnippetPreview` is itself ratcheted). Unit (4) + e2e in
      `snippets.spec.mjs`.
- [x] 7. Tools: `descKey` on every registry row, `tools.<id>.desc` catalogue
      entries, dim description line in `TextToolDialog`, `ToolRow` tooltip
      carries the description; registry unit test extended.
- [x] 8. Settings, red first: `e2e/settings.spec.mjs` gutter + visible-bar
      assertions watched FAIL, then `padding-right: var(--space-4)` (the
      scale has no `--space-5` — spec amended) and the scoped text-derived
      `scrollbar-color` pair; green.
- [x] 9. i18n: new keys in `en.json`, pseudolocale regenerated,
      `check:i18n` 1207/1207 clean, `check:rawtext` at baseline 0.
- [x] 10. theme-sweep: `tool-dialog` surface probes `.tt-desc` at the reading
      floor. The settings THUMB probe is not in the sweep — its measurement
      model reads element colour/border channels and a scrollbar has neither;
      the e2e pins the declared `scrollbar-color` pair instead, and the pair
      derives from `--text`, which `check-theme-depth` already ratchets on
      all 20.
- [x] 11. Release: `ubuntu-latest` / `build:linux` matrix row in
      `release.yml` (glob `dist/*.AppImage` + `dist/*.deb`),
      `linux.artifactName: diff-bro-v${version}.${ext}`. Verified by a local
      `npm run build:linux` on the host: both artifacts produced with the
      intended names (arm64 locally; CI runner builds x64).
- [x] 12. Docs: README hero alt + install row + snippets feature line;
      `docs/packaging.md` release section + Linux install/sandbox note.
      Roadmap .md/.svg NOT touched — amended to "no": the board has no
      snippets track and none of these eight items ever sat on it; adding a
      track to hand-authored artwork for a shipped feature is decoration.
- [ ] 13. `/validate`; `npm run check`; full e2e; fill Validation + token
      usage.

## Decisions

| date       | decision                                                                          | why                                                                                                                                                                        | rejected                                                         |
| ---------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2026-08-09 | Row loses Capture entirely (diagrams included)                                    | view mode and the Mermaid viewer both offer capture where the content is visible                                                                                           | modifier-key or overflow-menu row button                         |
| 2026-08-09 | History lives in `stores/snippetHistory.js`                                       | `snippetStore.js` is pinned at exactly 471 lines by `legacySize.mjs`; the `tagActions` spread is the shipped pattern                                                       | growing the store; raising the ratchet (forbidden)               |
| 2026-08-09 | Old ciphertext is the version record                                              | same AAD (immutable trio), so zero crypto changes and no plaintext ever re-handled                                                                                         | re-encrypting per version; plaintext hashes for change detection |
| 2026-08-09 | 20-version cap, oldest dropped                                                    | bounds storage without a Settings knob nobody asked for                                                                                                                    | unbounded; per-snippet setting                                   |
| 2026-08-09 | Drag writes `tagShelfRows`                                                        | one knob, two affordances — Settings control and grip can never disagree                                                                                                   | separate persisted pixel height                                  |
| 2026-08-09 | View-only history, no restore                                                     | asked scope; restore-as-new-version is its own spec                                                                                                                        | silent-overwrite restore button                                  |
| 2026-08-09 | Export bundles exclude history                                                    | a shared file must not carry past edits the sender never reviewed                                                                                                          | bundling full history                                            |
| 2026-08-09 | Settings scrollbar fix scoped to `.settings-pane`                                 | the app-wide quiet bar is a design choice (`base.css`); the complaint is Settings-specific                                                                                 | changing the global thumb                                        |
| 2026-08-09 | Gutter is `--space-4`, not the specced `--space-5`                                | the spacing scale ends at `--space-4` (16px); inventing a token for one gutter is what the scale exists to prevent                                                         | new `--space-5` token                                            |
| 2026-08-09 | History button wired inside `SnippetEditorActions`                                | the editor dialog's script block sits at its 100-line cap; the actions row already reads stores for copy-as-file                                                           | routing through the parent                                       |
| 2026-08-09 | Card actions split to `useSnippetPreviewActions`                                  | `useSnippetPreview` carries an exact `max-lines-per-function` ratchet entry; splitting beats the cap instead of raising it                                                 | growing the ratcheted function                                   |
| 2026-08-09 | Shelf drag writes on each row-step crossing, not on release                       | live feedback for ~10 bounded writes; the sidebar grip's write-on-release guards against per-FRAME writes, which quantising already prevents                               | write-on-release (dead-feeling drag)                             |
| 2026-08-09 | sweep `THEMES` stays at 14                                                        | the six newest themes were never added to the sweep; folding them in belongs with the standards.md "14 themes" staleness, not smuggled into this change                    | extending THEMES here                                            |
| 2026-08-09 | Settings thumb probe is the e2e, not a sweep probe                                | the sweep measures element colour/border channels; a scrollbar has neither, and the pair derives from `--text`, ratcheted by `check-theme-depth` on all 20                 | a third measurement channel for one probe                        |
| 2026-08-09 | Settings ▸ Limits row for `tagShelfRows` removed (**user's decision**, mid-build) | direct manipulation is the whole affordance; the number input duplicated it and the setting persists invisibly behind the grip                                             | keeping both affordances ("one knob, two handles")               |
| 2026-08-09 | Shelf depth is pointer-only for now (audit note, accepted)                        | the removed input was the only keyboard path; if it matters, arrow keys + `aria-valuenow` on the `role="separator"` grip restore it cheaply — a follow-up, not smuggled in | re-adding a visible control                                      |

## Validation

Recorded as fact, not intention.

- [x] `/validate` — one product gap found and fixed red→green (Quick Look
      edits skipped history); full record in `quality-audit.md`, zero open
      findings.
- [x] `/audit` — two agents. Reviewer: all eight security rules verified
      clean, ratchets tightened-not-raised, five findings — every one fixed in
      this change (history-dialog stale-load race → `useVersionPair` red→green;
      silent card-copy failure → shared notice red→green; spec staleness
      amended; keyboard-path note recorded; scratch spec deleted). QA: gate run
      twice green, 127 e2e green over two sweeps, data-loss tier hand-proven
      (real relaunch: edited snippet decrypts, history survives, secret stays
      masked). Its scrollbar finding (macOS overlay bar = no resting cue) fixed
      red→green (`barWidth 0 → 10`); masked-copy contradiction fixed red→green.
- [x] `npm run check` — final tree: 3003 passed / 2 skipped, coverage
      95.23 / 88.28 / 95.62 / 96.21 over 93 / 86 / 92 / 95 floors, theme depth
      ok (20 themes), i18n 1206/1206, raw text 0, structure clean (26 ratchet
      entries, all movements downward).
- [x] E2E — full suite 443 passed on the macOS host (13.5 m, single worker);
      7 initial failures (6 test bugs — stale dialog handle, aria-name pinning,
      seeded-tag arithmetic — and 1 CI-shaped flake) fixed and re-verified;
      every later delta re-run green including the relaunch-persistence and
      macOS-gated `quick-look-window-recovery` specs.
- [x] `make theme-sweep` — 756 measurements across 14 themes, green; the new
      `tool-dialog` probe's weakest pair is 5.92:1 (sepia) over the 4.5
      reading floor. The six newest themes stay outside the sweep's hardcoded
      `THEMES` (recorded follow-up, with the standards.md count).
- [x] Docs-impact "yes" rows done (README, packaging); roadmap rows amended
      to "no" with reasons.
- [x] seed fixtures n/a (no new format).
- [x] token usage measured, header row filled.

Mid-build user amendments, all delivered test-first: Settings ▸ Limits
`tagShelfRows` row removed (grip is the sole affordance; relaunch-persistence
e2e replaces the one-knob proof); grip flush to the shelf edge AND the strip
boundary (red at 10px); "+N more" opens ONLY the collapsed tags, retitled
"Collapsed tags" (red at 14-vs-6); a +1 overflow shows the tag itself; a
collapsed-rail centering guard added (defect not reproducible on a fresh
launch — the observed offset was the 160ms collapse animation).

### Token usage

251 requests, 2026-08-09T11:42:28Z → 13:05:53Z, one session, this work only.

| category    |         tokens |
| ----------- | -------------: |
| input       |            498 |
| output      |        191,203 |
| cache write |        722,811 |
| cache read  |     88,317,449 |
| **total**   | **89,231,961** |

**Outcome:** all eight items shipped plus five mid-build user amendments and
seven product defects found-and-fixed along the way (Quick Look history gap,
history-dialog race, silent card-copy failure, grip offset, "+N more" opening
the full registry, macOS resting-scrollbar gap, masked-copy contradiction).
Ships in v0.4.26.
