# Compare snippets by dragging them into the diff pane

|                                         |                               |
| --------------------------------------- | ----------------------------- |
| **Status**                              | in-progress                   |
| **Progress**                            | 2 / 11 steps                  |
| **Branch**                              | `feat/compare-snippets`       |
| **Started**                             | 2026-08-02                    |
| **Finished**                            | —                             |
| **Bugs found and fixed this iteration** | 0 / 0                         |
| **Token baseline**                      | 2026-08-02T20:17:25Z          |
| **Claude tokens used**                  | not measured                  |

## Problem

A snippet cannot be compared. The library holds exactly the things a reader
wants to diff — two versions of a config, a prompt before and after an edit, the
YAML someone pasted last week — and the only route from a snippet to a
comparison is to open it, select all, copy, switch to paste mode, paste, and
repeat for the second one.

Nothing in the app offers it: `git grep -in 'compareSnippet\|snippetToDiff'`
over `src/renderer/src` returns only a CLI help string. `SnippetRow.vue` has no
`draggable` attribute, and `useWindowFileDrop` (useFileDrop.js:23) admits a drag
only when `dataTransfer.types` includes `Files`, so a sidebar row dragged onto
the diff pane is inert.

The workaround also loses the link: pasted text is a dead copy, so editing the
snippet afterwards leaves the comparison silently stale.

## Solution

A snippet row becomes a drag source carrying its **id** (never its content), and
the window drop handler learns one more type alongside `Files`. Dropped ids
resolve to ordinary side objects and go through the existing `dropFiles`.

The reason this is small: `_place` (diffStore.js:470-472) already accepts either
a path string _or_ an object, and `receive` (diffStore.js:~800) assigns the whole
object to the side. So `{ path: null, name, content, snippetId }` is already a
valid side, and routing snippets through `dropFiles(sources, targetSide)` inherits
the whole orchestration for free — one snippet fills a slot and waits, two fill
both sides, and dropping onto a complete unsaved comparison raises the existing
replace guard (diffStore.js:753-760).

"Just like any ordinary diff" then needs no work: the side is shaped exactly like
a pasted one, so save, clear, export, tabs and the adapters all apply unchanged.

**Live updates** fall out of the same seam. The side keeps `snippetId`, a watcher
re-reads that snippet when its `updatedAt` changes, and feeds it back through
`receive` — which already sets `diffSaved = false`, so an edit correctly marks the
comparison unsaved again rather than quietly diverging from what was saved.

**Snippets are never written.** The flow is read-only: `snippets.load(id)`
decrypts a copy, and nothing in the diff path calls `update`/`add`.

| option                                                      | why not                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Put the snippet **content** in `dataTransfer`               | A drag payload is readable by any drop target, including a dialog that is not ours, and it would put decrypted snippet text on a channel we do not control. The id is enough; resolve it from the store.                                                   |
| A "Compare" item in the row's hover actions instead of drag | The row already carries four hover actions and the standards call that "a thin way to reach a feature". Worth adding **later** as a keyboard-reachable route, but drag is the asked-for gesture and the drop target is where the comparison already lives. |
| A dedicated snippet-comparison view                         | It would duplicate save/clear/export/tab handling that already exists, and the request is explicitly "just like any ordinary diff view".                                                                                                                   |
| Re-diff on a timer or on snippet-store mutation wholesale   | Re-reads every snippet on any change; a watcher keyed on the two live ids touches only what is on screen.                                                                                                                                                  |
| Snapshot on drop, no live link                              | Directly contradicts the requirement that an edit is picked up immediately.                                                                                                                                                                                |

## Scope

**In:** drag from `SnippetRow.vue`; a snippet-aware window drop; resolving ids to
sides; routing through `dropFiles`; live re-read on snippet edit; refusing secret
snippets; the drop overlay's copy while a snippet is in flight; unit + e2e tests.

**Out:** dragging a snippet **out** of the app (to Finder or another app);
dragging a saved diff or an external diff into the pane (same seam, separate
decision); a hover-action or context-menu "Compare" entry (recorded above as a
follow-up); comparing a snippet against a file on disk in one gesture — that
already works by dropping one of each, and needs no new code.

## Design

Reuses the existing drop affordance rather than inventing one. `useWindowFileDrop`
already drives `.drop-overlay` / `.drop-card` (App.css:107-119) — a scrim of
`color-mix(in srgb, var(--accent) 14%, rgba(0,0,0,0.45))` behind a card with a
`2px dashed var(--accent)` border and `--radius-xl`. The only change is the
card's copy, which becomes "Drop up to two snippets to compare" when the drag
carries snippets instead of files. No new token, no new control, no new geometry.

The row's drag handle is the row itself (`draggable="true"`), so no new control
height is introduced and `--chip-h` / `--control-h` are untouched. The hover
action buttons keep `draggable="false"` so a press on one still clicks rather
than starting a drag.

### Theme verdict — all 14

Grounds parsed from `src/renderer/src/styles/themes.css` (`--bg`; relative
luminance ≥ 0.5 = light) — 7 light, 7 dark, matching the standards' count. The
surface is the existing overlay, so the verdict is whether reusing it stays
correct, not whether a new thing works.

| theme    | ground | `--bg`    | `--accent` | verdict | note                                                                                                                           |
| -------- | ------ | --------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| light    | light  | `#ffffff` | `#c2410c`  | passes  | dark scrim over a light ground already ships; card reads as raised                                                             |
| dark     | dark   | `#0d1117` | `#2f81f7`  | passes  |                                                                                                                                |
| solar    | light  | `#fffdf6` | `#e8590c`  | passes  |                                                                                                                                |
| neon     | dark   | `#090d18` | `#22d3ee`  | watch   | high-chroma accent; the dashed rim is fine but **no glow/shadow may be added** to the card                                     |
| nord     | dark   | `#2e3440` | `#88c0d0`  | passes  |                                                                                                                                |
| sepia    | light  | `#e9dcbe` | `#9c4f1f`  | passes  | lowest-contrast light ground; scrim carries the separation, not the border alone                                               |
| dim      | dark   | `#1b1917` | `#d9a441`  | passes  |                                                                                                                                |
| beacon   | dark   | `#000000` | `#4cc2ff`  | passes  | hard-keyline contract untouched — nothing removes or softens a border                                                          |
| meridian | light  | `#f5f7f4` | `#0e8a8a`  | passes  |                                                                                                                                |
| linen    | light  | `#faf7f0` | `#3f5b8a`  | passes  |                                                                                                                                |
| bloom    | light  | `#f9f4f5` | `#b0446e`  | passes  |                                                                                                                                |
| nyan     | dark   | `#160a20` | `#ff2ecb`  | watch   | same halo risk as neon                                                                                                         |
| matrix   | dark   | `#020a04` | `#00ff41`  | watch   | same halo risk; also the lowest-luminance ground, so the 14% scrim is nearly invisible — the dashed rim is doing the work here |
| contrast | light  | `#ffffff` | `#1633d4`  | passes  | hard keyline `#111111` contract untouched                                                                                      |

The three `watch` rows are pre-existing behaviour of the shipped overlay, not a
regression this introduces. The constraint they impose on this change: the card's
copy may get longer, but the card must not gain an accent-tinted shadow or glow
to compensate.

## Security rules touched

- **Rule 6 (untrusted input is hostile).** The `dataTransfer` payload is the new
  untrusted surface. Only an **id** travels; the drop handler looks it up in
  `snippetStore.entries` and ignores anything it does not find, so a crafted drag
  from outside the app cannot inject content into a comparison. The custom type
  (`application/x-diffbro-snippet`) is checked before the payload is read, and the
  id is length-capped and treated as an opaque string — never a path.
- **Secret snippets are refused**, following the precedent
  `exportSnippetImage` sets (diffStore.js:573): a masked snippet exists so its
  plaintext is not on screen, and a diff pane is the largest possible screen for
  it. The row is not draggable when `isSecret(entry)`, and the store action
  refuses again on the receiving side so the guard does not live only in the UI.
- **Rule 3 (renderer never touches Node/Electron).** Nothing new crosses to
  main; decryption goes through the existing `snippets.load(id)` →
  `vault:decrypt` path.
- **Rule 4 (keys never cross IPC).** Untouched — plaintext content comes back,
  never key material.
- **Rules 1, 2, 5, 7, 8.** Untouched: no network, no new dependency, no crypto
  change, no `openExternal`, and content renders through Monaco/text
  interpolation as every other side does — no `v-html`.

## Test plan

Written before the code; each bug's test watched failing first.

- **unit** — `tests/renderer/utils/snippetSource.test.js`: an entry + content maps
  to `{ path: null, name, content, snippetId }`; a secret entry maps to `null`; a
  missing/unknown id maps to `null`; the name is the snippet's name, not
  "Untitled".
- **unit** — `tests/renderer/composables/useSnippetDrag.test.js`: `dragstart`
  sets the custom type and the id and **not** the content; the drop guard admits
  the snippet type, admits `Files`, and rejects a drag carrying neither; the
  depth counter behaves like the file one (no flicker on child enter/leave); a
  drop on `[data-side]` targets that side.
- **unit** — `tests/renderer/composables/useSnippetDiffSync.test.js`: editing a
  snippet that is live on a side re-reads it and updates that side only; editing
  an unrelated snippet touches nothing; the update marks `diffSaved = false`;
  clearing the comparison stops the watcher (no re-read after clear); deleting a
  live snippet leaves the comparison intact rather than blanking a side.
- **e2e** — `e2e/compare-snippets.spec.mjs`: drag one snippet to the left slot →
  it fills and the right still waits; drag a second → the diff renders; edit the
  first snippet in the editor while the diff is on screen → the pane updates
  without a reload; clear the comparison → both snippets still in the sidebar,
  unchanged; save the comparison → it appears under Saved diffs and the snippets
  are untouched; a secret snippet cannot be dragged.
- **red → green** — record each failure before the fix.
- **seed fixtures** — no change. `seed-local.mjs` already seeds the Mermaid and
  Claude example snippets, which is enough to drag two by hand; no new format is
  introduced.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                                                                                   |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | **yes** | The feature table's Snippets row describes what a snippet can do; comparing two of them is a new capability and belongs there.                                                                                                                                                 |
| `docs/screenshots/*.png` | no      | The five captured states are `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`. The drop overlay only exists mid-drag and none of these capture it; the empty-state copy ("Choose or drop two files to compare") is deliberately **not** changed. |
| `docs/roadmap.md`        | no      | The three live tracks are Spreadsheet, Onboarding, Signing. This is not one of them, so nothing moves open → done.                                                                                                                                                             |
| `docs/brand/roadmap.svg` | no      | Same reason — no track changes.                                                                                                                                                                                                                                                |
| `docs/*.md`              | **yes** | `security.md`: one line recording that a secret snippet cannot be dragged into a comparison, alongside the existing note that it cannot be exported as an image. `ipc-security.md` unchanged — no new IPC.                                                                     |

## Implementation plan

- [x] 1. Failing unit tests for `snippetSource` and the drag/drop guard. Watch
      them fail.
- [x] 2. `src/renderer/src/utils/snippetSource.js` — pure: entry + content → side
      source, `null` for a secret or unknown entry.
- [ ] 3. `src/renderer/src/composables/useSnippetDrag.js` — `dragstart` payload
      (id only) and the drop-type guard, factored out of the SFC so it is
      unit-testable (the standards' rule for event logic).
- [ ] 4. `SnippetRow.vue` — `draggable` on the row, `draggable="false"` on the
      hover actions, not draggable at all when secret. Confirm click-to-open and
      the hover buttons still work.
- [ ] 5. Teach `useWindowFileDrop` the snippet type: admit it in `hasFiles`'
      sibling guard and branch the drop to the snippet path, keeping the existing
      `.diffbrokey` / `.diffbro` short-circuits ahead of it.
- [ ] 6. `diffStore.dropSnippets(ids, targetSide)` — resolve ids → load content →
      map through `snippetSource` → hand to the existing `dropFiles`. Refuse
      secrets with a notice.
- [ ] 7. Failing unit test for live sync. Watch it fail.
- [ ] 8. `src/renderer/src/composables/useSnippetDiffSync.js` — watch the live
      `snippetId`s, re-read on `updatedAt` change, feed back through `receive`.
      Stop on clear/replace; survive deletion.
- [ ] 9. Drop-card copy for a snippet drag; verify no glow is added (theme table).
- [ ] 10. `e2e/compare-snippets.spec.mjs`; run in the container.
- [ ] 11. Docs (README row, `docs/security.md`), `npx prettier --write` on
      touched files, `npm run check`, `/validate`.

### Outstanding — where this branch stopped

The pure core is written and unit-tested (`snippetSource.js`, 9 tests): the
entry→side mapping, the secret refusal, and defensive parsing of the drag
payload. Nothing is wired to the UI yet — steps 3-11 remain, starting with the
`useSnippetDrag` composable and `SnippetRow.vue`.

## Decisions

| date       | decision                                                   | why                                                                                                                                                     | rejected                                      |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 2026-08-02 | Only the snippet **id** travels in `dataTransfer`          | A drag payload is readable by drop targets we do not own; the id is resolved against the store, so nothing can be injected                              | Carrying name + content                       |
| 2026-08-02 | Route through the existing `dropFiles`                     | `_place` already accepts object sources, so the replace guard, one-then-wait and two-fill-both come free and cannot drift from the file path            | A parallel snippet-drop orchestration         |
| 2026-08-02 | Secret snippets cannot be dragged into a comparison        | Same reasoning that already refuses them for image export (diffStore.js:573) — the mask exists so the plaintext is not on screen. **Worth confirming.** | Allowing it; prompting to unmask first        |
| 2026-08-02 | A live edit marks the comparison unsaved again             | `receive` already sets `diffSaved = false`; the alternative is an on-screen diff that silently differs from what was saved                              | Keeping `diffSaved` true across a live update |
| 2026-08-02 | A saved comparison keeps its live link while on screen     | It stays "just like any ordinary diff": the vault copy is a snapshot, and a later edit re-dirties the view rather than rewriting the saved record       | Dropping the link on save                     |
| 2026-08-02 | Deleting a live snippet leaves the comparison as it stands | Blanking a side would destroy work the reader is looking at; the content is already loaded and the diff is theirs until they clear it                   | Clearing the side; closing the tab            |

## Validation

- [ ] `/validate` — summary here, full report in `quality-audit.md`
- [ ] `npm run check` — real output
- [ ] flows seen running in the Docker env (`make e2e`), including the drag
- [ ] every Docs-impact "yes" done
- [ ] seed fixtures: n/a, recorded above
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
