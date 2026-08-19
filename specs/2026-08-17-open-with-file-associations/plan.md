# Open with — OS file associations

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 12 / 13 steps — code complete; hand-verification outstanding |
| **Branch** | `feat/editable-rendered-views` (shared — see Decisions) |
| **Started** | 2026-08-18 |
| **Finished** | |
| **Bugs found and fixed this iteration** | 2 / 2 |
| **Token baseline** | 2026-08-17T10:04:03Z (shared run) |
| **Claude tokens used** | |

## Problem

DiffBro cannot be opened *from* a file. It is absent from Finder's **Open With**
menu and Explorer's **Open with** list, because nothing declares an association:
`electron-builder.yml` has no `fileAssociations` key, and `src/main/index.js`
registers no `open-file` handler (`grep` over `src/main/` returns nothing for
either). Comparing two files means launching the app first and picking them from
inside it, or dropping to `diffbro compare a b` in a terminal.

**And the argv path an association would use is not merely unhandled — it is
actively broken.** `cliWords` (`src/main/cli.js:65-71`) strips argv[0] and then
one more word if it looks like a path, because that word is normally the entry
point (`electron .`). A file handed over by the OS lands in exactly that slot.
Measured, running the real parser:

| launch | `cliWords` | `parseCli` | what happens today |
|---|---|---|---|
| `[exe, C:\notes.txt]` — one file | `[]` | `{command: null, error: null}` | **silently nothing.** The window opens empty; the file is discarded |
| `[exe, C:\a.txt, C:\b.txt]` — two files | `["C:\\b.txt"]` | `{command: null, error: "Unknown command: C:\\b.txt"}` | **the app refuses to launch.** `index.js:46-48` writes the error to stderr and calls `app.exit(1)` — before any window exists |
| `[MacOS/Diff Bro]` — Finder cold launch | `[]` | `{command: null, error: null}` | fine, but the path never travels in argv on macOS anyway |

The second row is a live bug the moment an association is registered: select two
files in Explorer → Open with → Diff Bro, and the app exits(1) with no window and
no message the user will ever see. It has to be fixed as part of this, not after.

## Solution

Three layers, each with an existing seam to hang off:

1. **Declare the association.** `fileAssociations` in `electron-builder.yml` —
   `role: Viewer` on macOS (`CFBundleDocumentTypes`), NSIS `OpenWithProgids` on
   Windows, which adds DiffBro to the *Open with* list **without** seizing the
   default handler for `.txt` or `.json`. Seizing it is the failure mode to avoid:
   an offline diff viewer that swallows every double-clicked JSON is a bug report.
2. **Receive the file in main.** macOS `app.on('open-file')`, registered at
   module top level — it fires **before** `whenReady` on a cold Finder launch, so
   a handler installed inside `startApp` misses the very launch that caused it.
   Windows/Linux arrive through argv, on both the cold path and the existing
   `second-instance` handler (`index.js:90-101`).
3. **Route it.** A new pure `parseOpenWith(argv, { entryPath })` in `cli.js`
   sits *beside* `parseCli` rather than inside it, so the entry-point heuristic
   that every other verb depends on is not disturbed. It emits
   `{ name: 'open-with', files }`, delivered through the `deliver()` /
   `cli:ready` pending queue `cliRoute.js` already has, and vouched for with
   `allowCliPath` like every other CLI path.

### The 1-left / 2-right / 3-new-tab cycle

Derived from state, **not from a counter**:

> If the active tab was opened by *Open with*, has a left file and no right file
> → fill **right**. Otherwise → **new tab**, fill **left**.

A counter desyncs the moment the user does anything between two opens (closes the
tab, drops a file in by hand, switches tabs). Derived state produces the exact
cycle the user asked for when nothing intervenes, and stays sensible when
something does. The `openWith` marker on the tab is modelled on the `transient`
flag `tabs.js` already carries.

**Sequencing matters.** Finder sends one `open-file` per file, back to back, when
several are opened together — and each file is read asynchronously. Unserialised,
two events both see "no active open-with tab" and each make their own tab, so two
files that should have compared land in two tabs. The renderer handler chains on
a promise so file *n+1* decides after *n* has landed.

| option | why not |
|---|---|
| Reuse the existing `compare` command | `compareFromCli` (`commands.js`) fills left **and** right from one launch and always takes a fresh tab when the document is dirty. The whole point here is that files arrive **one at a time** and the second joins the first |
| Widen `parseCli` to treat a bare path as `open` | The entry-point strip is load-bearing for every other verb and was already the cause of two documented outages (`cli.js:44-57` — a clone directory read as a command, a Chromium switch read as ours). A separate function cannot regress them |
| A counter for the 1/2/3 cycle | Desyncs on any interleaved user action |
| Make DiffBro the default handler | Hostile. `role: Viewer` + `OpenWithProgids` means *available*, not *default* |
| Associate every text extension | A long list makes the Open-with menu useless and raises the odds of stealing a default. Ship the formats DiffBro actually compares |

## Scope

**In:**

- `fileAssociations` for the formats the adapters handle plus plain text:
  `.txt .md .markdown .json .xml .yaml .yml .csv .tsv .log .diff .patch`.
- macOS `open-file`, cold and warm, incl. the pre-`whenReady` buffer.
- Windows/Linux argv, cold and via `second-instance`.
- `parseOpenWith` + the `open-with` CLI command end to end.
- The left → right → new-tab cycle, serialised.
- **Fix the exit(1):** a launch whose leftover words are all existing-looking
  paths is never "Unknown command".
- Multi-select: N files open as ⌈N/2⌉ tabs, filling left then right.

**Out:** *(recorded, not drifted)*

- **Drag-a-file-onto-the-Dock-icon / onto the .exe.** Same `open-file` / argv
  seams, so it will likely work — but it is not specced, not tested, and not
  claimed.
- Making DiffBro the *default* for any extension. See above.
- A Settings toggle to register/unregister associations at runtime. The CLI shim
  and git-difftool have one (`cliRoute.js:138-152`) because they mutate `PATH`
  and `~/.gitconfig`; associations are installer metadata and belong there.
- Linux `.desktop` MIME registration. `fileAssociations` does emit it for `deb`,
  but there is no Linux install to verify it on in this cycle — argv still works.
- Spreadsheet binaries (`.xlsx`). The adapter reads them, but the Open-with entry
  for Excel files is a fight with Excel that nobody asked for.
- Sealed `.diffbro` / `.diffbrokey` imports. Those are untrusted-input surfaces
  with their own validation rules (rule 6); associating them is a separate spec.

## Design

**No new visual surface, so the 20-theme table is omitted rather than left
blank.** Externally opened files land in the file slots and panes that already
exist, styled by rules already swept. Nothing is added to the toolbar, the
sidebar or any dialog; no token, no control, no band.

One user-visible string, and it is a reuse: when all 16 tabs are in use
(`MAX_TABS`, `utils/tabs.js:6`), the refusal is the existing
`tabsFullMessage(files, MAX_TABS)` from `utils/cliCommand.js:28`, which already
names the files that did not open and already handles back-to-back launches by
accumulating `diff.blockedFiles`. That is precisely this situation — the same
notice, not a second one.

## Security rules touched

**Rule 6 (untrusted input is hostile) and rule 3 (renderer touches no Node) are
the ones in play. Neither is weakened; both get one more caller.**

- The path comes from the **OS**, not from the renderer. It is vouched for in
  **main** with `allowCliPath` (`files.js:51`) before the command is delivered,
  so `file:read` will serve it — the same fence, same bounded allow-list
  (`MAX_ALLOWED_PATHS`), that `compare` already uses. The renderer never names a
  path main has not already approved, and no new IPC handler is added: the
  command rides the existing `cli:command` channel and the existing
  `cli:ready` pending queue.
- **Size caps and adapter validation are unchanged.** An externally opened file
  goes through the same `file:read` and the same adapter registry as one picked
  in the app. Nothing about arriving from Finder makes it trusted.
- `parseOpenWith` stays **pure** — no `fs`, no `electron` — so it is unit-tested
  without a launch, matching the split `cli.js` already keeps
  (`docs/standards.md`: "keep pure logic out of Electron-importing files").
  It therefore decides on *shape*, never on existence; `allowCliPath` and the
  read are what actually gate a path.

- **Rule 1, offline: untouched.** No socket, no request, no new dependency —
  `fileAssociations` is installer metadata and `open-file` is an OS event.
- **Rule 7, leaving the sandbox: untouched.** This is the OS handing *us* a
  path, the opposite direction. No new `shell.openExternal` / `openPath` /
  `showItemInFolder` call site — the count stays where `docs/standards.md`
  pins it.
- Rules 2, 4, 5, 8: not engaged. No dependency, no key material, no crypto, no
  injection sink.

## Test plan

Written before the code.

- **unit** — `tests/main/cli.test.js` (extend): `parseOpenWith` over the three
  measured argv shapes in the Problem table, plus the dev-run `['electron', '.']`
  and a Chromium-switch-carrying launch. **This is where the exit(1) bug is
  pinned:** assert two-file argv yields two files and **no error**, watched
  failing against today's `parseCli` first.
- **unit** — `tests/renderer/utils/commands.test.js` (extend): the `open-with`
  entry resolves (the file already fails if a named action resolves to nothing).
- **unit** — `tests/renderer/stores/tabsStore.test.js`: the cycle as pure state —
  1st → new tab + left, 2nd → same tab + right, 3rd → new tab + left; a tab
  closed between 1 and 2 → new tab; all 16 tabs in use → `tabsFullMessage`, no
  crash.
- **e2e** — `e2e/open-with.spec.mjs`: launch the app with a file path in argv and
  assert it lands in the left slot; then a second launch (`second-instance`
  path) lands in the right slot of the same tab; a third makes a new tab. This is
  the preload/IPC round-trip and the pending-queue drain, which jsdom cannot see.
- **red → green** — two of them, recorded: the two-file exit(1), and the
  one-file silent discard.
- **macOS `open-file` is verified by hand.** It cannot be driven by Playwright
  (the event comes from Finder/LaunchServices) and it does not exist on Linux, so
  `make e2e` proves nothing about it. Verified natively per the macOS-gated
  convention: `npm run build`, then `open -a` against the built app with a file
  argument, cold and warm.
- **seed fixtures** — `scripts/seed-local.mjs` ships `.xlsx`/`.yaml`/`.xml`/
  `.json` and **no** `.csv`/`.tsv`. Add a `.md` and a `.txt` before/after pair
  with the `seed` tag: those are the extensions this feature associates, and
  `make local-seed` is the only way an Open-with launch gets tried by hand on the
  Mac. Confirm `local-seed-clean` removes exactly what it wrote.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | new capability. "Open with" belongs beside the CLI and git-difftool entry points — a reader currently concludes the only ways in are the app itself and `diffbro compare` |
| `docs/screenshots/*.png` | **no** | nothing on screen changes. A file opened from Finder renders in the same panes as one picked in-app |
| `docs/roadmap.md` | **yes** | new track: OS integration. Mermaid node + terse `Done.` bullets, no prose |
| `docs/brand/roadmap.svg` | **yes** | hand-authored twin of the same move |
| `docs/security.md` | **yes** | a new way for an outside path to enter the app. Short note: vouched by `allowCliPath` in main, read through the same fence, no new IPC |
| `docs/ipc-security.md` | **no** | no handler added or changed — `open-with` rides the existing `cli:command` channel |
| `docs/glossary.md` | **no** | no new domain term |
| `docs/standards.md` | **no** | no new convention; the pure-parser split is being followed |

## Implementation plan

- [x] 1. ~~Branch off `main`~~ — shares `feat/editable-rendered-views` by the user's decision; baseline shared.
- [x] 2. `tests/main/cli.test.js` — the three argv shapes; watch the two-file exit(1) and one-file discard go red.
- [x] 3. `src/main/cli.js` — `parseOpenWith(argv, { entryPath })`, pure. Green.
- [x] 4. `src/main/index.js` — `app.on('open-file')` at module top level with a pre-`whenReady` buffer, drained in `startApp`.
- [x] 5. `src/main/cliRoute.js` — route `open-with`: `allowCliPath` each file, then `deliver`. Wire the argv path into the cold launch and `second-instance`.
- [x] 6. `tests/renderer/stores/tabsStore.test.js` — the cycle, red.
- [x] 7. `utils/tabs.js` + `tabsStore` — the `openWith` marker and the left/right/new-tab rule. Green.
- [x] 8. `utils/commands.js` — `open-with` in `CLI_COMMANDS`, serialised so back-to-back opens land in order; all-tabs-full reuses `tabsFullMessage`.
- [x] 9. `electron-builder.yml` — `fileAssociations`, `role: Viewer`, the extension list from Scope.
- [x] 10. `e2e/open-with.spec.mjs`.
- [x] 11. `scripts/seed-local.mjs` — `.md` / `.txt` before-after pair, `seed` tag; verify `local-seed-clean`.
- [ ] 12. Hand-verify on macOS: build, `open -a` cold and warm, single and multi-select. **Confirm Windows does not become the default handler** for `.txt`/`.json` — the one claim in this plan that only a real NSIS install can settle.
- [x] 13. Docs: `README.md`, `docs/roadmap.md`, `docs/brand/roadmap.svg`, `docs/security.md`.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-17 | `parseOpenWith` beside `parseCli`, not inside it | The entry-point strip is load-bearing for every verb and has already caused two outages (`cli.js:44-57`). A separate pure function cannot regress them | widening `parseCli` |
| 2026-08-17 | The cycle is derived state, not a counter | A counter desyncs on any interleaved user action | an open-with counter |
| 2026-08-17 | `open-file` registered at module top level | It fires before `whenReady` on a cold Finder launch; a handler in `startApp` misses the launch that caused it | registering inside `startApp` |
| 2026-08-17 | `role: Viewer` / `OpenWithProgids`, never default handler | Swallowing every double-clicked `.json` is a bug report, not a feature | default association |
| 2026-08-17 | The two-file exit(1) is fixed in this spec | Registering an association is what exposes it; shipping the association without the fix ships the crash | deferring it |
| 2026-08-18 | `entryPath` is the entry SCRIPT, not `app.getAppPath()` | **Second bug, found in build.** Unpackaged, Electron passes `[electron, build/main/index.js, …files]`, so argv[1] is the app's own source. `app.getAppPath()` is the repo ROOT and never matched it, so the script was opened as a document — a real `index.js ↔ index.js` tab. Callers now pass `app.isPackaged ? null : process.argv[1]` | comparing against the app root |
| 2026-08-18 | Close-confirmation actions split into `stores/tabClosing.js` | `tabsStore` hit its 323-line ratchet. The file already spreads `evictionActions` and `sessionActions` for exactly this reason, so the guard every close route funnels through follows that precedent | raising the cap |
| 2026-08-17 | macOS `open-file` hand-verified, not E2E | LaunchServices cannot be driven by Playwright and the event does not exist on Linux, so `make e2e` would prove nothing. Same reasoning as the existing macOS-gated specs | a spec that skips off macOS and proves nothing |
| 2026-08-18 | Both specs share `feat/editable-rendered-views` | The user chose it when asked, over committing spec 1 to isolate the branches. Deviates from the one-spec-one-branch rule and from each spec's own "two specs, two branches" decision — recorded here rather than left as drift | a branch per spec |
| 2026-08-17 | Two specs, two branches | Shares no file and no reason with `editable-markdown-preview` | one combined spec |

## Validation

- [ ] `/validate` — outstanding
- [x] `npm run check` — **exit code 0**. Coverage 95.33 stmts / 88.38 branches / 95.79 funcs / 96.40 lines
- [x] `npm run check:i18n` / `check:rawtext` — pass inside `check`; no new user-facing string for this feature (the tabs-full refusal reuses `tabsFullMessage`)
- [x] E2E seen running: **3/3 pass** — `e2e/open-with.spec.mjs`. Covers left→right→new-tab, the two-file crash case, and three files landing as two tabs
- [ ] **macOS hand-verification outstanding** — needs a packaged build; LaunchServices cannot be driven from a test
- [ ] **Windows default-handler check outstanding** — needs a real NSIS install
- [x] `make local-seed` writes `notes-before/after.md` + `plain-before/after.txt`; `--clean` takes the directory back to 0 files
- [x] every Docs-impact "yes" done — README (new Open with row), `docs/roadmap.md` (new OS-integration track), `docs/brand/roadmap.svg` (card 7, "Six tracks" → "Seven"), `docs/security.md` (a new way for an outside path to enter)
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category | tokens |
|---|---:|
| input | |
| output | |
| cache write | |
| cache read | |
| **total** | |

**Outcome:**
