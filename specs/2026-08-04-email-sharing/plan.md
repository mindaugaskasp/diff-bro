# Sending a sealed diff by email

|                                         |                      |
| --------------------------------------- | -------------------- |
| **Status**                              | shipped              |
| **Progress**                            | 19 / 19 steps        |
| **Branch**                              | `feat/email-sharing` |
| **Started**                             | 2026-08-04           |
| **Finished**                            | 2026-08-04           |
| **Bugs found and fixed this iteration** | 24 / 24              |
| **Token baseline**                      | 2026-08-04T07:28:45Z |
| **Claude tokens used**                  | not measured         |

## Problem

A sealed `.diffbro` stops at the disk. `share:export` forces the filename, asks
only _where_, writes it, and ends. Everything after is improvised: find the file,
open a mail client, remember the address, type it, attach.

The address is the part the app almost knows. A recipient is already a named
trusted key (`trusted-keys.json` holds `{ fingerprint, label, sign, box }`), so
the app can say "Ana (work laptop)" but has nowhere to put `ana@example.com`.

Two more gaps surfaced with it:

- **Neither list survives thirty keys.** `ShareDiffDialog` and
  `TrustedKeysDialog` both render an unbounded `<ul>` in a ~400px dialog — no
  search, no scroll cap, insertion order. Adding an address per row makes it
  worse. A feature whose point is picking the right person cannot ship with a
  picker that cannot find them.
- **The clipboard carries only text.** `clipboardFiles.js` already decodes seven
  file flavours _off_ the clipboard for paste-to-compare; there is no way to put
  one _on_ it. So "copy this and paste it into the message" does not exist — for
  a `.diffbro` or anything else.

Structural constraint: **`share.js` could not grow** (pinned at `{ fn: 267,
file: 568 }` in `legacySize.mjs`), so a new trusted-key handler had nowhere to go.

## Solution

**Diff Bro never sends. It hands off.** _Email this diff_ seals the diff exactly
as before, opens the user's own mail client on an addressed message, puts the
sealed file on the clipboard, and reveals it as a fallback. The user presses Send.

**No socket is opened, so hard rule 1 is untouched rather than amended.** An
in-app SMTP client was specced and rejected — see Decisions. The trap it would
have sprung is worth keeping: `installNetworkKillSwitch` filters
`session.defaultSession.webRequest`, which is **Chromium traffic only**, so a
main-process `tls.connect` would have been invisible to it. The guarantee holds
because nothing in main opens a socket, not because anything stops it.

**Email is transport, never a second crypto path.** What the user pastes is the
byte-identical file `sealEntry` already produces. `sealing.js`, `vaultCrypt.js`
and `snippetSealing.js` are not opened.

`mailto:` cannot carry an attachment — `attach=` was never standardised and was
historically a local-file exfiltration vector, so `isSafeMailtoUrl` **refuses**
one rather than ignoring it. Hence the clipboard, with the reveal as fallback.

### Rejected

| option                                       | why not                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| In-app SMTP                                  | Reverses rule 1 for one saved keystroke; costs a network dependency, credential storage, and a `README.md` claim that stops being true |
| Renderer passes the sealed path to a handler | Hands it an arbitrary-path parameter into the OS file manager. Main already knows the path — it wrote it                               |
| `mailto:?attach=…`                           | Not standardised, not honoured, historically an exfiltration vector                                                                    |
| Address inside the `.diffbrokey`             | Would be attacker-supplied on import and would travel to third parties. It is local annotation                                         |
| A `features/email` slice owning recipients   | Recipient identity stays in `share`; splitting the owner is how the diffStore grab bag started                                         |

### Where the code goes

`share.js` is the change that beats its cap: `trustedKeys.js` and
`shareExport.js` come out of it, and the `legacySize.mjs` entry is **retightened**.

| file                                               | role                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `main/trustedKeys.js` _(extracted)_                | the trust store, incl. the new `email`; list/rename/remove/set-email IPC          |
| `main/shareExport.js` _(extracted)_                | `sealAndWrite()` — the core `share:export` and `mail:handoff` share               |
| `main/mailAddress.js` · `mailto.js` _(pure)_       | address validation (CR/LF, separators, bidi refused) and `mailto:` construction   |
| `main/mail.js` _(glue)_                            | `mail:handoff` — seal → build → confirm → open → copy → reveal                    |
| `main/clipboardWrite.js` _(pure)_                  | the OS file flavours; the write counterpart to `clipboardFiles.js`                |
| `main/clipboardStage.js` · `clipboardCopy.js`      | the `0o700` staging dir, and `clipboard:writeFile` (bytes + a name, never a path) |
| `utils/recipientSearch.js` · `utils/copyAsFile.js` | ranking via the shared `rank()`; file/name shaping for both copy commands         |
| `composables/useRecipientPicker.js`                | picker state and keyboard guards, extracted so they are testable                  |
| `features/email/`                                  | `emailStore`, `EmailSettings`, `EmailHandoffDialog`                               |

Direction is **`share → email`, never back**, so there is no cycle.

## Scope

**In:** an optional address per trusted key · a delivery step on the share flow ·
search + scroll caps on both recipient lists · Copy as file, differentiated from
Copy content · Settings → Email · named failure states.

**Out** _(recorded, not drifted into)_:

- **Any sending.** No SMTP, no credentials, no OAuth, no contact book.
- **Snippets sealed by email.** They seal with a passphrase, not a recipient key
  (`snippetSealing.js:145`), so mailing one mails its own key. **This narrows the
  original request.** Copy as file works for snippets today.
- **Recently-shared-with ordering** and **recipient groups** — both useful past
  thirty, both their own spec. See Decisions.

## Design

Built from existing classes and tokens only; new icons `mail`, `clipboard`,
`shield`. No new dialog component.

- **Settings → Email** — an eighth `TABS` row: subject template (`{name}`,
  `{expires}`), a standing note, the reveal toggle. Thin by nature; fold it into
  a **Sharing** pane the moment a second sharing preference appears.
- **Trusted keys** — a third row line for the address (`--text-hint`, not
  `--text-dim`; see the sweep), plus search, alphabetical order and a capped
  scroll region. The count reads `12 of 30` while filtered.
- **The picker** — two regions, and **only the lower one filters**. Selected
  recipients sit above the divider and ignore the query, or ticking someone then
  searching seals for a person no longer on screen. Ranking reuses `rank()`
  (`quickLook.js`), so the picker agrees with the palette and the sidebar.
  Keyboard: `↑`/`↓` through the filtered list, `Space` toggles **only when the
  query is empty**, two-stage `Escape`.
- **Share → deliver** — the primary is what the user can do now: _Email this
  diff_ when every pick has an address, else _Create file_ with _Add an address…_.
- **Copy content vs Copy as file** — adjacent in the snippet view and the Edit
  menu. A secret snippet renders it **disabled with the reason**.

### Theme verdict — all 14

`check:themes` holds the tokens; `make theme-sweep` holds what they compose into,
reading computed colours off the live DOM in every theme (126 measurements, all
clear). Four findings shaped the design:

1. **State colour cannot carry state.** `--success-text` misses 4.5:1 on solar
   (3.09), sepia (3.61), bloom (4.19); `--danger-border` on nord (**1.80**), dim,
   dark. So the label is `--text` and colour lives on the icon and keyline only —
   also the colour-blind answer, and the reasoning `--dg-*` already runs on.
2. **No `--warning-border` on an advisory strip** — 2.74 on contrast. A 3px
   `--warning-bg` fill bar instead.
3. **No accent tint on success** — on matrix `--accent` **is** `--success-text`.
4. **A scrolling list gets a `--border` rule, not a fade** — rows are
   `--bg-raised` on `--bg-panel`, and contrast/beacon carry a hard-keyline
   contract a soft edge would break.

The sweep then caught a fifth: the unset **"Add email"** state used `--text-dim`
and scored **3.44 on sepia**. It is a call to action, so it moved to
`--text-hint` ("hint text that must stay readable"). Worst score now 7.74.

## Security rules touched

**Rule 1 is not one of them** — no socket, no new dependency.

| rule                        | how it stays inside                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3 · renderer isolation**  | `mail:handoff` takes fingerprints and text; `clipboard:writeFile` takes **bytes and a display name, never a path**. The renderer cannot name a file to stage or learn the staging dir                               |
| **6 · hostile input**       | Addresses validated in main before storage: CR/LF, comma, semicolon, angle brackets, whitespace and **bidi overrides** refused. Staged names slugged flat. A restored backup's bad `email` is dropped, key kept     |
| **7 · leaving the sandbox** | `mailto:` is the **third** `openExternal` site — built in main, `isSafeMailtoUrl`-checked (scheme only; `attach` refused in query **and** fragment), user-confirmed. `showItemInFolder` gets the path main computed |

**Copy as file opens a plaintext window**, bounded rather than assumed away:
`0o700` staging, pruned at 30 min, swept on `will-quit` **and** next launch (a
crash skips the first), names slugged, extensions closed to a safe set, and
**secret snippets refuse it**. A sealed `.diffbro` is unaffected — it is ciphertext.

Rules **4**, **5** and **8** are untouched.

## Test plan

Unit tests mirror their subjects under `tests/main/` and
`tests/renderer/{utils,composables,features/email}/`. E2E:
`e2e/email-handoff.spec.mjs` (hand-off, cancel, no-address, **thirty keys with a
filter that must not hide a selection**) and `e2e/copy-as-file.spec.mjs`, which
reads what it wrote back through the app's own `clipboardFilePaths` — the read
side is already trusted, which makes it the right oracle.

**Red → green, watched:** breaking the picker's `picked` to read the filtered
list fails 3 tests; collapsing the two cancels fails the save-dialog test.

## Docs impact

| doc                    | what changed                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `docs/standards.md`    | Rule 7 (three `openExternal` sites, `showItemInFolder`, staging); `make theme-sweep` |
| `docs/ipc-security.md` | `mail:handoff`, `clipboard:writeFile`, `share:setTrustedEmail`                       |
| `docs/security.md`     | The hand-off, and the staged-plaintext window                                        |
| `README.md`            | The **Share** row. "Zero network" needed no edit                                     |
| `docs/glossary.md`     | hand-off · Copy content vs Copy as file · staged file                                |

## Steps

All 19 complete. The order that mattered: the clipboard spike first (it gated the
UI), then the two `share.js` extractions (nothing else fit until they landed),
then pure modules, glue, UI, e2e, docs.

**Spike result (macOS):** the pasteboard accepts `NSFilenamesPboardType` as XML,
a name with non-ASCII, a space, `?` and `#` round-trips exactly, and sequential
`writeBuffer` calls do not clear each other. `availableFormats()` under-reports,
which `clipboardFilePaths` already handles by reading content. **Windows
unverified** — see Validation.

## What the review and QA passes found

Two agents reviewed the first commit and found **18 further defects** — enough
that it should not have been called finished. The ones worth carrying forward:

| finding                                                                                   | why it got through                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cancelling the **save dialog** saved a twin and recorded a share for a file never written | Two cancels reach the renderer; only one carries a `path`. **My own test asserted the bug as the contract**                                      |
| The two-stage Escape never ran                                                            | `BaseDialog` listens on window in capture and `stopPropagation`s. The unit test called `handleKey` directly — the "test that never failed" shape |
| Space silently ticked a recipient and could not be typed                                  | The key table consumed `' '` unconditionally; the e2e used `fill()`, which dispatches no keydown                                                 |
| `revealAfterCreate` was a dead setting                                                    | Persisted, rendered, never sent                                                                                                                  |
| A long note orphaned a sealed file and blamed the address                                 | `too-long` was remapped to `bad-address`, and the path dropped                                                                                   |
| `canWriteFile` could never return false                                                   | The freedesktop flavours were the fallback for every unknown platform                                                                            |
| Non-Latin titles became `diffbro.txt`; any extension could be staged                      | An ASCII-only `\w` slug, and no extension allowlist                                                                                              |
| Both new e2e specs could not pass                                                         | Wrong dialog title, wrong row class, placeholder keys that cannot seal, an import that does not exist in a bundled build                         |

Five more came from a human looking at the running app — neither test nor agent
caught them, and both are now measured invariants in
`e2e/email-handoff.spec.mjs`:

- **Every recipient row stacked and centred.** `ui.css` sets
  `.dialog label { flex-direction: column }` for every label in a dialog, so a
  row declaring only `display: flex` inherits `column` — the checkbox landed
  above the name and `align-items: center` centred both. The row is now explicit
  about its direction, and the test asserts the checkbox and the name share a
  vertical centre.
- **The dialog resized while picking.** The chips row appeared on the first tick
  (+20px) and the list shrank as a query narrowed it. Both regions reserve their
  height now — the list from its UNFILTERED count, capped at eight rows — the
  same reservation `SettingsDialog` already makes for its panes.
- **Five diff types, five different status bars.** Spreadsheet and streamed sat
  at `--control-h` (30px), structure and diagram at `--band-row` (52px); three
  colour sets and three wordings (`+3 rows`, `◆ 4 changed`, `+5 −4`). They are
  one `.status-band` in `ui.css` now, reading `<Thing> N added · N changed ·
N removed` everywhere, on the `--dg-*` pair that is already reasoned about for
  colour-blind readers. The text diff's counts moved out of the toolbar into it.
  The floating shortcut bar was covering those bars — it clears them now, which
  it had never done for the three that already existed.
- **Split view and Ignore whitespace stayed visible beside a grid.** Both are
  Monaco diff-editor options, so they do nothing once Grid, Structure, Diagram or
  a streamed comparison is showing — a control that cannot act reads as broken,
  not as N/A.
- **The paste/file mode toggle stayed on a saved diff.** It sets a comparison
  UP; a vault-backed tab has nothing to switch the mode of, and the click would
  replace what the reader opened. Gated on the `isSavedDiff` getter `Clear`
  already uses.

Three more came out of running the suite rather than reading it:

- **A sixth hover action covered the snippet row's own click target**, so
  clicking a snippet stopped opening it. Copy as file moved to the view dialog.
- **The hand-off rejected at the IPC boundary**: a draft's `snapshot` is a deep
  reactive Proxy and structured clone refuses one. `toRaw` is shallow. Only a
  real launch catches this; the saved-diff path never hit it because `load()`
  returns a fresh decrypt.
- **`node_modules` is a volume that shadows the image layer.** Two failures
  looked like a CSS regression and bisected as one — they were a stale volume.
  `npm ls` shows the truth where `npm audit` (which reads the lockfile) does not.

## Dependency audit

`npm audit` reported **2 high**, `--omit=dev` **0**. Both are `brace-expansion`
(`GHSA-rgw5-rvv9-x895`), and **the cause was already in this repo**: commit
`0e19214` added an EXACT override `"brace-expansion": "5.0.8"` to close
CVE-2026-14257, and this advisory is the _bypass_ of that mitigation. Being
exact, the pin held the tree on the vulnerable version and made `npm audit fix`
a **no-op** (verified: `added 0, removed 0, changed 0`).

Fixed by moving the pin to **`^5.0.9`** — caret deliberately, because an exact
pin is what let this rot from "fixed" to "vulnerable" untouched. This is not the
`overrides` hack `docs/standards.md` warns about: that rule is about
_introducing_ one to force a newer major in a build tool; this keeps an override
the repo already relies on at a non-vulnerable patch.

`make audit-fix` was documented as `npm audit fix` but ran `--force`
(semver-major, reaching electron and electron-builder). Safe is now the default;
`make audit-fix-force` is the other one and says so.

## Decisions

_(append-only — a superseded entry stays, so the reasoning behind a reversal
survives with it)_

- ~~**2026-08-04 · Both routes, not one.**~~ `mailto:` hand-off as the default,
  SMTP opt-in under Settings → Email. **Superseded 2026-08-04 by the hand-off
  decision below.**
- ~~**2026-08-04 · nodemailer over a hand-rolled `node:tls` client.**~~ Accepted
  as one new production dependency. **Superseded — no dependency is needed now.**
- **2026-08-04 · Hand-off only. The app never sends.** Supersedes both entries
  above. Rationale: the SMTP route bought one saved drag-and-drop and cost a
  reversal of hard rule 1, a network dependency to audit, credential storage and
  its failure modes, and a `README.md` claim that would stop being true. The
  hand-off delivers the same user outcome — an addressed message and the file
  ready to attach — with zero of that. The one real loss is that the user
  presses ⌘V and Send themselves; `mailto:` could not have carried an attachment
  anyway.
- **2026-08-04 · The sealed path never round-trips through the renderer.** One
  main-process call seals, writes, opens and reveals, using the path it computed.
  The alternative would hand the renderer an arbitrary-path parameter into
  `shell.showItemInFolder`.
- **2026-08-04 · Sealed `.diffbro` to trusted keys only.** Email is transport. A
  passphrase-sealed attachment to arbitrary addresses was rejected: it puts the
  file and the secret that opens it on the same channel.
- **2026-08-04 · Snippets are out of scope.** Snippet bundles are
  passphrase-sealed, not key-addressed (snippetSealing.js:145). Narrows the
  original request; revisit when snippet sealing becomes key-addressed.
- **2026-08-04 · State is an icon, not a colour.** Forced by the theme table:
  `--success-text` fails the 4.5:1 text floor on solar/sepia/bloom and
  `--danger-border` on nord/dim/dark.
- **2026-08-04 · Settings → Email is kept, provisionally.** With SMTP gone it
  holds three preferences. Merge it into a **Sharing** pane the moment a second
  sharing preference wants a home. Flagged for the review, not decided silently.
- **2026-08-04 · A filter may never hide a selection.** Selected recipients
  render above the divider and ignore the query. Without it, filtering after
  ticking someone silently seals for a person no longer on screen — the failure
  the picker's own unit test is written to catch.
- **2026-08-04 · The recipient scorer is `rank()`, not a new one.** quickLook.js
  already backs the palette and the sidebar and states agreement between search
  surfaces as its intent; a fourth surface with its own matching rules would
  make the app disagree with itself about what a query finds.
- **2026-08-04 · Recently-shared-with ordering is out.** Cheap (`lastSharedAt`
  on a record already being touched) and useful at thirty, but unasked-for and
  it makes list order non-deterministic under test. Alphabetical, plus search.
- **2026-08-04 · Copy as file ships behind a platform spike.** `CF_HDROP` via
  Electron's `writeBuffer`, and multi-flavour atomicity, are the least-travelled
  paths here. Step 1 proves them per platform before any UI is built; a platform
  that cannot be made to work does not offer the command. Nothing else in the
  spec depends on the outcome — the hand-off keeps its Finder reveal.
- **2026-08-04 · The clipboard write side takes bytes, never a path.** The read
  side (`clipboardFiles.js`) treats clipboard paths as untrusted; the write side
  refuses the symmetrical mistake of letting the renderer name a file to stage.
- **2026-08-04 · Secret snippets refuse Copy as file.** Their guarantee is that
  the contents never land somewhere readable. A volatile text clipboard honours
  that; a plaintext file in `/tmp` does not.
- **2026-08-04 · The two npm advisories are fixed here, not deferred.** They
  predate this branch and reach no shipped code (`--omit=dev` is clean), so the
  argument for a separate PR was reviewability, not risk. Folded in because the
  fix is in-range (`isSemVerMajor: false`), it is a lockfile-only edit, and a red
  audit that belongs to nobody stays red. Written by the container's npm so
  `npm ci` keeps working.
- **2026-08-04 · The decrypted entry is held OUTSIDE Pinia state.** Reactive
  state deep-proxies what it holds, and structured clone refuses a Proxy at the
  IPC boundary — `toRaw` is shallow, so a nested `snapshot` still crossed as one
  and the whole hand-off rejected. Only a real launch caught it. It also means
  plaintext is never observable, which is the right property independently.
- **2026-08-04 · Copy as file lives in the snippet VIEW, not the row.** A sixth
  hover action covered the row's own click target, so clicking a snippet stopped
  opening it. The view already carries Copy, so the pair reads as a pair there —
  and the row stays a thin surface, which this repo has already said once.
- **2026-08-04 · Staged plaintext is swept twice.** On `will-quit` and again on
  next launch, because a crash skips the first and a snippet surviving a reboot
  in the temp directory is the failure that actually matters.

## Validation

- [x] `npm run check` clean — 2213 tests, coverage 95.38 / 87.76 / 96.47 / 96.46
      against floors 93 / 86 / 92 / 95
- [x] `make e2e` clean — **316 passed, 0 failed, 2 skipped**
- [x] Five caps beaten and retightened, none raised: `share.js` 267→225 fn /
      568→510 file, `menu.js`, `menus.js`, `diffStore.js`, `vaultStore.js`
- [x] No new import cycle (`share → email` only)
- [x] No socket — asserted over `mail.js`'s whole import graph, not grepped
- [x] No IPC handler accepts a filesystem path from the renderer
- [x] `make theme-sweep` — 126 measurements across 14 themes, all clear
- [x] `npm audit` 0 vulnerabilities, host and fresh container; `npm ci` succeeds
- [x] 30-key seed verified end to end (`make local-seed-many`); `--clean` removes
      exactly what it wrote
- [ ] **Windows/Linux Copy as file unverified** — no Win32 host was available, so
      `CF_HDROP` has only its round-trip against `pathsFromHdrop` behind it.
      `canWriteFile` now genuinely gates it
