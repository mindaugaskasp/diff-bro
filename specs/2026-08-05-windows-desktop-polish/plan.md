# Windows desktop polish — five field reports

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 25 / 25 steps |
| **Branch** | `fix/windows-desktop-polish` |
| **Started** | 2026-08-05 |
| **Finished** | 2026-08-05 |
| **Bugs found and fixed this iteration** | 11 / 11 |
| **Token baseline** | 2026-08-05T16:01:34Z |
| **Claude tokens used** | — |

## Problem

Five reports from a Windows user. Four are defects, one is a missing capability.

### 1. The toolbar forces a horizontal scrollbar on the whole app

Measured against the built app on this host (probe: set the window to the current
minimum, read the document):

```
window 940 (the current minWidth)  →  documentElement.scrollWidth = 1274, clientWidth = 940
  KeyActions block  255px
  .options block   1004px
  .toolbar padding   24px  +  gap 16px
```

334px of overflow **at the smallest size the app allows itself to be opened at**.
`.options` is `white-space: nowrap` ([AppToolbar.css:19](src/renderer/src/components/styles/AppToolbar.css#L19))
and `.app` is a plain flex column with no overflow rule
([App.css:1-5](src/renderer/src/components/styles/App.css#L1-L5)), so the
toolbar's min-content width becomes the document's, and the entire window —
sidebar, panes, status band — scrolls sideways.

[window.js:55](src/main/window.js#L55) claims the 940 minimum "keeps the sidebar +
split Monaco panes usable". It does; it just never accounted for the toolbar,
which has since grown four toggles and six buttons.

### 2. Sidebar section reordering does not work on Windows

File drag-and-drop works (OS-initiated). Snippet-row drag works. Only the
**section headers** fail — and they are the one draggable surface in the app
carrying `user-select: none`:

| draggable surface | `user-select: none` | works on Windows |
|---|---|---|
| section header ([SectionHeader.css:26](src/renderer/src/components/styles/SectionHeader.css#L26)) | yes | **no** |
| snippet row ([useSnippetDrag.js](src/renderer/src/composables/useSnippetDrag.js)) | no | yes |
| file drop (OS-initiated) | n/a | yes |

That is a known Chromium-on-Windows interaction: `user-select: none` suppresses
the drag that `draggable="true"` would start, where macOS starts it anyway. The
correlation is exact and explains all three rows.

The second half of the problem is why it shipped:
[useSectionReorder.test.js](tests/renderer/composables/useSectionReorder.test.js)
calls the handlers directly with fabricated events, so it passes on every
platform while the real interaction is dead. Nothing in the suite drove a real
drag. (An assumption in the draft of this plan — that Playwright cannot drive
native HTML5 drag in Electron — turned out to be false; `page.mouse` does. That
means the new e2e passes against the OLD code on macOS, so this defect could not
be made red on this host at all.)

### 3. Closing the window on Windows quits the app

[index.js:103-105](src/main/index.js#L103-L105) quits on `window-all-closed` for
every non-darwin platform. There is no tray, so a Windows user who presses X has
no way back short of relaunching, and the global quick look-up shortcut dies with
the process. There is also no way to have DiffBro available at sign-in.

### 4. "Copy as file" produces a clipboard nothing outside DiffBro can paste

The user's exact observation — Explorer and mail clients ignore the paste,
DiffBro itself accepts it — is the signature of the actual bug.

[clipboardWrite.js:77](src/main/clipboardWrite.js#L77) writes the Windows file
flavour as `clipboard.writeBuffer('CF_HDROP', …)`. Electron writes a custom
platform format, which on Windows is `RegisterClipboardFormat(name)`. That
returns a **freshly registered format whose name happens to be the string
"CF_HDROP"** — not the predefined `CF_HDROP` (id 15) that the shell reads. No
other application looks for it; DiffBro's own reader
([clipboardFiles.js:166](src/main/clipboardFiles.js#L166)) asks for the same
name, gets the same custom id back, and round-trips perfectly.

This is also why macOS and Linux are fine: `NSFilenamesPboardType`,
`text/uri-list` and `x-special/gnome-copied-files` are *name-registered* formats
on their platforms, so registration by name yields the real thing. Windows
predefined formats are the only ones with no name to register.

### 5. `Ctrl+Shift+Space` is a poor Windows default

[quickLook.js:27](src/main/quickLook.js#L27) and
[settingsDefaults.js:9](src/renderer/src/utils/settingsDefaults.js#L9) both ship
`CommandOrControl+Shift+Space` on every platform.

## Solution

Five independent changes, one branch. Ordered so the two that carry the most
risk (2 and 4) get their tests first.

**1 — Compact the toolbar, then raise the minimum to 1100.** Shed ≥174px of
intrinsic width by demoting the two label+icon buttons that already carry an
`<AppIcon>` (`Copy diff`, `Capture`) to `.btn-icon`, then `Clear`, until the
measured min-content is ≤1100. Raise `minWidth` 940 → 1100. Add `min-width: 0` +
internal `overflow-x` to `.options` so a longer locale degrades to a scrolling
toolbar rather than a scrolling application.

**2 — Rebuild section reordering on pointer events.** Replace HTML5
`dragstart`/`dragover`/`drop` in
[useSectionReorder.js](src/renderer/src/composables/useSectionReorder.js) with
`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`. Immune to the
`user-select` quirk by construction, and immune to every other native-drag quirk
too: HTML5 dnd exists to carry a payload between documents, and a section never
leaves the sidebar.

**3 — Tray on Windows, close-to-tray on by default.** `Tray` with Open / Quick
look-up / Exit, `win.on('close')` hiding instead of closing, an explicit
`quitting` flag so Exit and `app.quit()` still work, and two Settings toggles:
close-to-tray (on) and start at sign-in (off).

**4 — Windows gets `FileGroupDescriptorW` + `FileContents`.** Both are
name-registered formats, so `writeBuffer` produces the genuine article — this is
the same mechanism that makes the macOS and Linux flavours work today. Plus
`Preferred DropEffect` = `DROPEFFECT_COPY`. The existing custom-`CF_HDROP`
buffer stays so DiffBro→DiffBro paste keeps working.

**5 — Platform-defaulted accelerator**, `Control+Alt+Space` on Windows, with a
one-time migration for anyone still sitting on the old default.

| option | why not |
|---|---|
| **1** Raise `minWidth` to 1280 and leave the toolbar | Measured requirement is 1274; 1280 is the honest number but it drops 1024-wide screens. User chose compaction. |
| **1** Wrap the toolbar to two rows | Breaks the `.band-row` height contract that lines the first sidebar header up with the file slots. |
| **2** Add `-webkit-user-drag: element` to `.head.draggable` | One line, probably correct — but unverifiable on this host, and it would leave the interaction dependent on native drag for a gesture that never leaves the window. **Correction:** the plan claimed Playwright cannot drive native HTML5 drag in Electron. It can — `page.mouse` does, and the new spec passes against the OLD implementation on macOS. So this bug could not be made red here either way; the rewrite is justified by removing the platform dependence, not by a red test. |
| **2** Drop drag, keep only the arrow reorder | Removes a working interaction on two platforms to fix a third. |
| **3** Tray on Linux too | Tray support is uneven across desktops; on a GNOME session without an extension, close-to-tray leaves the user with no way back to the window. |
| **4** Spawn PowerShell `[Windows.Forms.Clipboard]::SetFileDropList` | Guaranteed real `CF_HDROP`, but a child process per copy, and it dies under Constrained Language Mode. Kept as the documented fallback if the format route is reported still broken. |
| **4** Native module for the real `CF_HDROP` | A build-toolchain dependency and an install script (rule 2 / the `allowScripts` gate) for one clipboard format. |
| **5** Change Linux to match Windows | Not reported, and no evidence `Ctrl+Shift+Space` collides there. Windows only. |

## Scope

**In:** toolbar compaction + `minWidth`; pointer-based section reorder; Windows
tray, close-to-tray, start-at-sign-in; Windows clipboard file flavours; the
Windows quick look-up default and its migration.

**Added mid-build, at the user's request:** `{{token}}` placeholders in a
snippet's NAME, resolved once at save (steps 23–25). A snippet has no
description field — name, content, syntax, tags and the secret flag are all of
it — so the request's "name or description" resolves to the name.

**Out:**
- Whether `user-select: none` breaks any *other* draggable on Windows. The
  audit above found none; if one appears it is its own spec.
- Any change to the macOS/Linux window lifecycle, tray or accelerator.
- The Explorer-side "Preferred DropEffect" move semantics (copy only, never cut).
- `docs/roadmap.md` — these are defects and one small platform capability, not a
  roadmap track.

## Design

Tokens only. The compaction reuses `.btn-icon` from `ui.css` at `--control-h`;
no new control geometry, no new colour, so `check:styles` and `check:themes`
have nothing new to hold. The drop-target cue on a reordering header keeps the
existing `outline: 2px dashed var(--accent)` + `color-mix(… 14%)` wash — the
pointer rewrite changes *when* `.drop-target` is applied, never how it looks.

The only genuinely new pixels are the tray icon, which is OS chrome and outside
the theme system.

### Theme verdict — all 14

Values parsed from `styles/themes.css`. Ground is `--bg`.

| theme | ground | verdict | note |
|---|---|---|---|
| light | `#ffffff` light | pass | floating-canvas inversion; `.btn-icon` is the same `--btn-face` veil the labelled `.btn` already uses |
| dark | `#0d1117` dark | pass | |
| solar | `#fffdf6` light | pass | |
| neon | `#090d18` dark | pass | accent `#22d3ee` stays on the keyline, never the glyph |
| nord | `#2e3440` dark | pass | |
| sepia | `#e9dcbe` light | pass | |
| dim | `#1b1917` dark | pass | |
| beacon | `#000000` dark | pass | hard keyline `#e0e0e0` — `.btn-icon` keeps `--btn-edge`, nothing softens a border |
| meridian | `#f5f7f4` light | pass | |
| linen | `#faf7f0` light | pass | |
| bloom | `#f9f4f5` light | pass | |
| nyan | `#160a20` dark | pass | accent `#ff2ecb`; no accent glow added, so no halo |
| matrix | `#020a04` dark | pass | accent `#00ff41`; same |
| contrast | `#ffffff` light | pass | hard keyline `#111111` — preserved by `.btn-icon` |

Verdicts rest on reusing `.btn-icon` unchanged; `make theme-sweep` confirms the
compacted toolbar as a surface rather than trusting the reuse argument.

## Security rules touched

- **Rule 3 (renderer never touches Node/Electron)** — three new IPC handlers
  (`tray:setCloseToTray`, `app:setStartAtLogin`, and the tray's own menu
  actions). Each takes a boolean and nothing else; the renderer never names a
  path, an executable or a registry key.
- **Rule 7 (leaving the sandbox is fenced in main)** — `setLoginItemSettings`
  writes a Windows Run entry pointing at `process.execPath`, **computed in
  main**, never round-tripped through the renderer. No new `openExternal`,
  `openPath` or `showItemInFolder` call site.
- **Rule 7 (clipboard staging)** — `clipboard:writeFile` keeps taking bytes and
  a display name and never a path. Everything the staging invariants promise
  (`0o700` dir, `mkdtemp`, 30-minute TTL, sweep on quit **and** on launch)
  is untouched. One exposure change to record: `FileContents` puts the bytes on
  the clipboard directly, not only a path to them. A secret snippet already
  refuses Copy as file, and the plain text clipboard already carries non-secret
  content, so nothing crosses a line it was not already crossing — but it is a
  change and it goes in `docs/ipc-security.md`.
- **Rule 1 (offline)** — nothing here opens a socket. The tray, the login item
  and the clipboard are all local OS surfaces.
- **Rule 2 (dependencies)** — none added.

## Test plan

Written before the code. Every defect gets a test watched failing first.

- **unit** `tests/main/clipboardWrite.test.js` — `fileFlavours` on `win32`
  returns `FileGroupDescriptorW`, `FileContents`, `Preferred DropEffect`; the
  descriptor round-trips through a new reader (`cItems`, the 592-byte
  `FILEDESCRIPTORW`, `nFileSize{High,Low}`, the UTF-16 `cFileName`);
  `Preferred DropEffect` is a 4-byte LE `DROPEFFECT_COPY`. **Red first:** today
  the win32 list is `['CF_HDROP']` alone.
- **unit** `tests/main/trayCore.test.js` — a new pure `trayCore.js`: does this
  close hide or close (platform × setting × quitting flag), and the menu row
  ids. No Electron import, so it is unit-testable per the `sealing.js` split.
- **unit** `tests/renderer/composables/useSectionReorder.test.js` — rewritten
  for pointer events: capture, the hovered-header hit test, cancel on Escape,
  no-op when locked, and no reorder when the pointer never left the source.
- **unit** `tests/renderer/utils/settingsDefaults.test.js` — the platform
  default, and that a stored `CommandOrControl+Shift+Space` on Windows migrates
  once to `Control+Alt+Space` while any other stored value is left alone.
- **unit** `tests/main/quickLookCore.test.js` — main's fallback matches the
  renderer's per platform.
- **e2e** `e2e/section-reorder.spec.mjs` — `page.mouse` drags SNIPPETS above
  SAVED DIFFS; the order holds after relaunching the same profile. **Red
  first:** this cannot be written against the current HTML5 implementation at
  all, which is the point.
- **e2e** `e2e/toolbar-width.spec.mjs` — at the new minimum bounds,
  `documentElement.scrollWidth === clientWidth`, asserted in `en` and in the
  `en-XA` pseudolocale. **Red first:** 1274 vs 940 today.
- **e2e** `e2e/copy-as-file.spec.mjs` — existing spec; unchanged on Linux (its
  flavours do not move). The Windows flavours are covered by the unit
  round-trip, since CI has no Windows runner.
- **seed fixtures** — none. No new format, no changed data shape.

**Cannot be proven on this host:** items 2, 3, 4 and 5 are Windows behaviours.
The unit + e2e work above proves the *logic* on macOS/Linux; the Windows
behaviour itself needs a run on the reporter's machine, and the plan says so
rather than claiming green.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | tray / close-to-tray / start-at-sign-in is user-visible Windows behaviour, and the minimum window size is stated nowhere else |
| `docs/screenshots/*.png` | **yes** | the toolbar is in every captured frame — `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff` all restale, and the README `alt` text with them |
| `docs/roadmap.md` | no | four defects and one small platform capability; no track opens or closes |
| `docs/brand/roadmap.svg` | no | follows roadmap.md, which does not move |
| `docs/ipc-security.md` | **yes** | three new handlers, and the `FileContents` exposure note |
| `docs/packaging.md` | **yes** | the Windows installer story now includes a login item |
| `docs/security.md` | no | no hard rule changes meaning; the clipboard note belongs in ipc-security.md |
| `docs/standards.md` | **yes** | one line under rule 7: why Windows file flavours are descriptor-based, so the next person does not "simplify" it back to `CF_HDROP` |

## Implementation plan

Toolbar

- [x] 1. `e2e/toolbar-width.spec.mjs` — assert no document-level horizontal
      overflow at minimum bounds, `en` and `en-XA`. Watch it fail at 1274/940.
- [x] 2. Demote `Copy diff` and `Capture` to `.btn-icon` (`aria-label`, keep the
      existing `data-tip`); re-measure. If >1100, demote `Clear` next, then trim
      `.toolbar`/`.group` gaps. Stop at the first state ≤1100.
- [x] 3. `.options { min-width: 0; overflow-x: auto }` so a longer locale
      scrolls the toolbar, never the app.
- [x] 4. `window.js` `minWidth` 940 → 1100; update the comment to say what the
      number is now derived from. Step 1 green.
- [x] 5. `make theme-sweep` over the compacted toolbar; add it to `SURFACES`.

Section reorder

- [x] 6. `e2e/section-reorder.spec.mjs` with `page.mouse`. Watch it fail.
- [x] 7. Rewrite `useSectionReorder.js` on pointer events + `setPointerCapture`;
      keep the `dragId`/`hoverId`/`movedId` shape so the CSS cues are untouched.
- [x] 8. `SectionHeader.vue`: `@pointerdown`, drop `:draggable` and the four
      HTML5 bindings. Keep the click-to-toggle, suppressed once a drag passes
      threshold.
- [x] 9. Rewrite `useSectionReorder.test.js`. Steps 6 + 9 green.

Clipboard

- [x] 10. Extend `tests/main/clipboardWrite.test.js` for the descriptor
      flavours + a reader to round-trip them. Watch it fail.
- [x] 11. `fileFlavours` takes `{ paths, name, bytes }`; win32 emits
      `FileGroupDescriptorW` + `FileContents` + `Preferred DropEffect`, and
      keeps the custom `CF_HDROP` for DiffBro's own reader. Comment says why the
      predefined format is unreachable.
- [x] 12. Thread the bytes through `clipboardCopy.js` without widening the IPC
      contract. Step 10 green.

Tray + startup

- [x] 13. `resources/tray.png` / `tray@2x.png` via `render-brand-assets.mjs`.
- [x] 14. `src/main/trayCore.js` (pure) + `tests/main/trayCore.test.js`.
- [x] 15. `src/main/tray.js` — Electron glue, menu, `quitting` flag, the
      `win.on('close')` intercept, `registerTrayIpc`.
- [x] 16. `settingsDefaults.js` + `settingsStore.js`: `closeToTray` (default
      true), `startAtLogin` (default false), their setters and IPC calls.
- [x] 17. `SettingsDesktop.vue` + a Windows-only Settings tab; catalogue strings
      in `src/shared/i18n/en.json`.
- [x] 18. `--hidden` accepted by `parseCli` and starting the app to tray, so the
      login item does not trip the CLI's "malformed command → exit 1" path.

Shortcut

- [x] 19. Platform-defaulted `DEFAULT_QUICKLOOK_SHORTCUT` + the one-time
      migration; mirror in `quickLook.js`. Tests per the plan above.

Docs

- [x] 20. `README.md`, `docs/ipc-security.md`, `docs/packaging.md`,
      `docs/standards.md`.
- [x] 21. `make screenshots` in the container; check every regenerated frame.
- [x] 22. `node scripts/pseudolocale.mjs`; `npm run check:i18n` +
      `check:rawtext` clean.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-05 | Compact the toolbar to a 1100 minimum rather than raising it to the measured 1274 | Keeps 1024-wide screens openable; user's call | `minWidth: 1280` |
| 2026-08-05 | Rewrite reorder on pointer events instead of the CSS workaround | The workaround cannot be verified on this host or tested in Playwright; the rewrite is provable and immune | `-webkit-user-drag: element` |
| 2026-08-05 | Close-to-tray defaults **on**, start-at-sign-in defaults **off** | The reported behaviour; a login item is a machine-level change nobody should get by surprise | both off; both on |
| 2026-08-05 | Tray on Windows only | Linux tray support is uneven enough to strand a user with a hidden window | Windows + Linux |
| 2026-08-05 | Keep writing the custom `CF_HDROP` buffer alongside the descriptor | It is what DiffBro's own paste reads; inert to every other app | drop it and teach the reader the descriptor |
| 2026-08-05 | Windows-only accelerator change | Only Windows was reported; no evidence of a Linux collision | change Linux too |
| 2026-08-05 | Migrate an existing stored `CommandOrControl+Shift+Space` on Windows | A default change alone reaches nobody who already ran the app — i.e. everyone who reported this | leave stored values alone |
| 2026-08-05 | `.btn-square` (a plate) rather than `.btn-icon` for the compacted actions | `.btn-icon` is flat by design; a flat glyph beside labelled siblings reads as unavailable — the exact failure the resting-affordance work fixed | `.btn-icon` |
| 2026-08-05 | Minimum is **1120**, not 1100 | Measured: the compacted bar needs 1122, so 1100 left the last action 2px behind an internal scroll. The e2e now asserts the bar is not clipped at the minimum, so the number cannot be set under it again | 1100 |
| 2026-08-05 | Snippet TEMPLATES apply to the name only | There is no description field on a snippet; tags were left out because a templated tag would multiply the vocabulary every day | name + tags |
| 2026-08-05 | Tokens resolve ONCE, at save, into the field itself | A name re-evaluated on read would rename yesterday's note to today, and an editor showing `{{today}}` beside a library showing the date is two names for one snippet | resolve on render |
| 2026-08-05 | ISO week written out rather than adding a date library | Day-granularity local time with one rule; a library would earn its audit for timezone arithmetic, which this does not do | `date-fns` |
| 2026-08-05 | Held the new `toggle label` probe at the 4.5 READING floor and fixed the colour, rather than declaring it at 3 | They are words a user reads. Declaring 4.5, seeing four themes fail and then moving the probe to 3 is exactly the ratchet-lowering docs/standards.md forbids — even for a probe I was choosing the floor for | declare it DIM, as `settings-email`'s micro-label is |


## Bugs found and fixed while building

Eleven, of which six were introduced by this change. Four were caught by tests; two only by looking at the rendered result —
recorded because the plan's "red → green" claim does not otherwise survive
contact with what actually happened.

| # | bug | found by | fix |
|---|---|---|---|
| 1 | Toolbar's intrinsic width (1274) exceeded the window minimum (940), scrolling the whole document | `e2e/toolbar-width.spec.mjs`, red at 1274/940 | compaction + `minWidth` 1120 |
| 2 | Windows `CF_HDROP` written as a private custom format nothing else can read | `tests/main/clipboardWrite.test.js`, red | `FileGroupDescriptorW` + `FileContents` + `Preferred DropEffect` |
| 3 | **Introduced.** `setPointerCapture` on the PRESS retargets `pointerup`, so Chromium fires no click on any control inside a section header — "New snippet" and every row action stopped working | `e2e/compare-snippets.spec.mjs` (existing) went red | capture only once the drag threshold is crossed; ignore a press that starts on a control |
| 4 | **Introduced.** An abandoned press (focus lost mid-gesture) stayed armed, so a later unrelated move finished a drag nobody started | `useSectionReorder.test.js` | `endGesture()` first and unconditionally on every press |
| 5 | **Introduced.** `hasTemplate` used a `/g/` regex with `.test`, which advances `lastIndex` — it answered differently on alternate calls | `snippetTemplates.test.js` | a separate non-global regex |
| 6 | `toggleSectionsLock` has no caller anywhere in the UI, while the section header's tip told users to "lock in the toolbar" | reading the code for the reorder rewrite | tip corrected to "Drag to reorder"; the dead action is left for its own spec |
| 7 | **Pre-existing.** `make theme-sweep` could not run at all: it seeds a trust store but never disables tips, so the onboarding tour's tint took the pointer and the first click timed out | running the sweep this spec requires | the profile now gets `onboarding.json` with `showTips: false`, the same workaround `e2e/fixtures.mjs` documents |
| 8 | **Introduced.** `@keydown.esc` bound on a header with no `tabindex` — a handler that could never fire | reading back the diff | removed rather than shipped as decoration |
| 9 | **Pre-existing.** The toolbar's toggle labels sat on `--text-dim`, under the 4.5:1 reading floor on solar (3.99), nord (4.05), sepia (3.44) and bloom (4.31) — and the `.off` rule "greyed out" an unavailable toggle to the colour it already was, so the disabled cue did nothing on the ink axis | `make theme-sweep`, once the new `toolbar-actions` surface measured it | resting labels moved to `--text`; `.off` keeps `--text-dim` and is now visibly dimmer |
| 10 | **Introduced.** `overflow-x: auto` on `.options` computes `overflow-y` from `visible` to `auto`, so a stepper-arrow scrollbar appeared at the right edge of the toolbar on every theme | LOOKING at the regenerated theme screenshots — no assertion had anything to say about it | `overflow: auto hidden`, both axes named |
| 11 | **Introduced.** The group divider bled into the bar's padding with a negative margin, which is the only thing that overflowed `.options` once it became a scroll container — so the bleed was being clipped and had bought the scrollbar above | the same screenshots, then measured (`scrollHeight` 38 vs `clientHeight` 30) | divider spans the control row instead of the band |

## Not fixed, found on the way

- `settingsStore.toggleSectionsLock` is unreachable from the UI. Either the lock
  needs a control or the action should go; both are more than this spec's scope.

## Validation

Recorded as fact.

- [x] `npm run check` — clean. lint · style tokens (102 stylesheets) · theme
      depth (14 themes) · structure (371 files, 4 baselined cycles, 27 legacy
      size entries) · i18n (975 keys, 975 used) · raw text (0, held) · build.
      Coverage **95.03 stmts / 87.89 branch / 95.61 funcs / 96.05 lines**
      against floors of 93 / 86 / 92 / 95.
- [x] `npm run test` — **2540 passed, 2 skipped**, 182 files.
- [x] `make e2e` (in the container) — **369 passed, 0 failed, 2 skipped** (4.0m)
      on the final run. The first run had one failure:
      `sidebar-collapse.spec.mjs`'s own reorder test, which dispatched
      `dragstart`/`dragover`/`drop` by hand. It is superseded by
      `e2e/section-reorder.spec.mjs` and was removed with the reason recorded at
      the deletion point.
- [x] `make theme-sweep` — **✓ ok, 378 measurements across 14 themes.** The new
      `toolbar-actions` surface holds: the square glyph + its keyline read
      5.98 (nord, worst) to 13.74 against the 3.0 non-text floor, and the toggle
      labels now clear 4.5 everywhere after the colour fix (bug 9).
- [x] `make screenshots` — all five README frames plus `diagram-diff`
      regenerated and LOOKED AT. That is what caught bugs 10 and 11; the
      compacted bar was measurably fine and visibly wrong.
- [x] Docs: `README.md`, `docs/ipc-security.md`, `docs/packaging.md`,
      `docs/standards.md`.
- [ ] **Windows behaviours confirmed by the reporter.** Items 2, 3, 4 and 5 are
      Windows-only and cannot be proven from macOS. What was proven here is the
      logic (unit) and the cross-platform wiring (e2e); the platform behaviour
      itself is unverified until it runs on the reporter's machine.
- [x] token usage measured

### Token usage

Measured over 239 requests, 2026-08-05T16:01:34Z → 17:06:41Z. The window is
wall-clock and covered only this work.

| category | tokens |
|---|---:|
| input | 477 |
| output | 127,077 |
| cache write | 234,597 |
| cache read | 60,832,419 |
| **total** | **61,194,570** |

**Outcome:** All five reports addressed, plus the snippet-name templates added
mid-build. Eleven defects fixed, six of them introduced by this change and caught
before it left the branch — four by tests, two only by looking at the rendered
screenshots.

Two of the five (toolbar width, snippet templates) are verified end to end here.
The other three plus the shortcut default are Windows behaviours: their logic and
cross-platform wiring are covered, but the platform behaviour itself is
**unverified until it runs on Windows**. The clipboard fix is the one with real
residual risk — the diagnosis is solid and explains the symptom exactly, but
whether Explorer accepts `FileGroupDescriptorW`/`FileContents` from Electron's
`writeBuffer` can only be settled by a paste on the reporter's machine. The
PowerShell fallback is recorded above if it is not.
