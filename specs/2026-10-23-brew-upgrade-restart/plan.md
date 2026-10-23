# Restart onto the new build after `brew upgrade`

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 7 / 7 steps |
| **Branch** | `fix/brew-upgrade-restart` |
| **Started** | 2026-10-23 |
| **Finished** | 2026-10-23 |
| **Bugs found and fixed this iteration** | 5 / 5 |
| **Token baseline** | 2026-10-23T11:04:36Z |
| **Claude tokens used** | 7,004,344 |

## Problem

`brew upgrade --cask diff-bro` replaces `/Applications/Diff Bro.app` while the
app is running. The old process keeps running the old code until the user
quits it by hand. Nothing tells them a newer build is on disk.

- `packaging/homebrew/diff-bro.rb` has no `uninstall quit:` stanza. Homebrew
  therefore swaps the bundle under the running process instead of quitting it
  first.
- `src/renderer/src/updateRecovery.js` reacts only when a lazily loaded chunk
  fails to load. A session that never opens a new chunk stays on the old build
  indefinitely.
- The `second-instance` version check (`src/main/index.js:108`) only fires when
  the app is launched again.

## Solution

1. **Cask.** Add `uninstall quit: "com.mindaugas.diffbro"`. `brew upgrade`
   then quits the app before swapping the bundle. Homebrew runs the uninstall
   stanza of the cask that is *already installed*, so this takes effect from
   the upgrade after next.
2. **App (macOS, packaged builds only).** On every window focus, main reads
   `CFBundleShortVersionString` from its own bundle's `Info.plist`. If the
   version on disk differs from the running one, main sends `app:updated` once
   per version. The renderer shows a held notice, "Diff Bro was updated to
   vX — Restart". Restart works as follows:
   - It refuses while a snippet tab has unsaved changes. It activates that tab
     and says why.
   - Otherwise it seals the session (`saveSession`) and relaunches through the
     existing `app:relaunch` handler.

| option | why not |
|---|---|
| Relaunch automatically when the bundle changes | Discards whatever the user is in the middle of; a restart is their call |
| `fs.watch` on `Info.plist` | Brew moves the whole bundle away. An inode watch dies with the old file, and a path poll costs a timer for an event that focus already covers |
| An update feed or version check over the network | Breaks the offline guarantee (rule 1) |
| `uninstall quit:` alone | Does nothing for the first upgrade, or when a quit is refused |

## Scope

**In:** the cask stanza and its generator; the bundle-version check (a pure
core plus glue); the preload event; the notice with a guarded Restart.

**Out:**
- Windows and Linux installers. They have no in-place swap under a running app
  that this repo controls.
- Making `brew`'s quit wait for unsaved snippet drafts. It behaves exactly like
  Cmd+Q does today.

## Design

The notice reuses the `DiskChangeNotice` surface: `--bg-raised`,
`--border` keyline, `--shadow-2`, `--control-h`. Restart is a `.btn .btn-sm`
(a neutral action with no primary beside it, so not `.btn-ghost`). Dismiss is
the same `x` `AppIcon` button. It stacks below the disk notice when both are
up.

### Theme verdict — all 20

Built only from surface roles and the shared `.btn` ladder, which
`check:themes` already holds to floors on all 20. It is the same composition
as `DiskChangeNotice`, which has passed the sweep on every theme. `contrast`
and `beacon` keep their hard keyline through `--border`. No accent glow, so
`matrix`, `nyan` and `neon` have nothing to halo. The new surface is added to
the theme sweep's `SURFACES` and verified there.

## Security rules touched

- **Rule 1 (offline).** Reads a local file inside the app's own bundle. No
  socket, no URL.
- **Rule 3.** The fs read lives in main. The renderer receives one version
  string through `window.api.onAppUpdated`.
- **Rule 6.** The plist is read with a size cap. The version must match
  `^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$` or it is ignored.
- Rules 4, 5, 7 and 8 are untouched. No new dependency.

## Test plan

- **unit** — `tests/scripts/homebrewCask.test.js`: the generated cask carries
  `uninstall quit:` with `electron-builder.yml`'s `appId` (red first).
- **unit** — `tests/main/bundleVersion.test.js`:
  - the plist parse;
  - the size cap;
  - a malformed version;
  - `updatedVersion` reports a differing version once and the same one never;
  - a missing file.
- **unit** — `tests/renderer/composables/useAppUpdated.test.js`:
  - Restart refuses and activates a dirty snippet tab;
  - Restart seals the session before relaunching;
  - Dismiss hides the notice.
- **e2e** — `e2e/app-updated.spec.mjs`: main sends `app:updated`, the notice
  shows the version, and Restart calls relaunch (stubbed in main). A dirty
  snippet blocks it (red first: no notice exists).
- **seed fixtures** — none; no new format.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | install instructions unchanged |
| `docs/screenshots/*.png` | no | notice is transient, in no captured state |
| `docs/roadmap.md` | no | a fix, not a track |
| `docs/brand/roadmap.svg` | no | same |
| `docs/*.md` | yes | `docs/packaging.md`: what `uninstall quit:` does and the first-upgrade caveat |

## Implementation plan

- [x] 1. Extract the cask text into `scripts/lib/homebrewCask.mjs`; failing test; add `uninstall quit:`; update `packaging/homebrew/diff-bro.rb`
- [x] 2. `src/main/bundleVersion.js` core + tests (red first)
- [x] 3. Glue: focus check in main, `onAppUpdated` in preload
- [x] 4. `useAppUpdated` composable + tests
- [x] 5. `AppUpdatedNotice.vue` + i18n + pseudolocale; theme-sweep surface
- [x] 6. e2e spec, red → green
- [x] 7. `docs/packaging.md`; `/validate`; `npm run check`

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | Check on window focus | After `brew upgrade` in a terminal, the next thing the user does is come back to the app | polling timer; fs.watch |
| 2026-10-23 | `uninstall` placed after `postflight_steps` | `brew style` Cask/StanzaOrder | the spot beside `app` |
| 2026-10-23 | Cask text moved to `scripts/lib/homebrewCask.mjs` | the generator fetches at import, so it could not be tested | testing the `.rb` file alone |
| 2026-10-23 | Restart refuses on a dirty snippet | Relaunch restores comparisons from the sealed session, but snippet drafts are not in it | prompting to discard |

## Validation

- [x] `/validate`: five defects fixed red → green (see `quality-audit.md`).
  One item is open and outside the repo's control: a real `brew upgrade` swap
  under a packaged build can only be seen with the next release.
- [x] `npm run check`: exits 0, 3880 tests pass, coverage
  95.38 / 88.47 / 95.97 / 96.41.
- [x] UI seen running:
  - `e2e/app-updated.spec.mjs` was 3 red (notice unmounted) and then 3 green
    on the host.
  - The theme sweep `update-notice` took 80 measurements across 20 themes, all
    at or above their floors.
  - `brew style` reports no stanza-order offence.
- [x] Docs-impact "yes" done: `docs/packaging.md`, "Upgrading a running app".
- [x] Token usage measured.

| category | tokens |
|---|---:|
| input | 116 |
| output | 37,386 |
| cache write | 123,115 |
| cache read | 6,843,727 |
| **total** | **7,004,344** |

**Outcome:** two changes, both shipped.
- **Cask.** `brew upgrade` quits Diff Bro before swapping the bundle, from the
  second upgrade after this lands.
- **App.** Until then, and whenever a swap slips past the quit, the app offers
  a Restart on its next focus. Restart refuses while a snippet is unsaved.
