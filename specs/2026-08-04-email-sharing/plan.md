# Sending a sealed diff by email

|                                         |                      |
| --------------------------------------- | -------------------- |
| **Status**                              | in-progress          |
| **Progress**                            | 19 / 19 steps        |
| **Branch**                              | `feat/email-sharing` |
| **Started**                             | 2026-08-04           |
| **Finished**                            | —                    |
| **Bugs found and fixed this iteration** | 24 / 24              |
| **Token baseline**                      | 2026-08-04T07:28:45Z |
| **Claude tokens used**                  | —                    |

## Problem

A sealed `.diffbro` stops at the disk. `share:export` (share.js:288-300) forces
the filename, asks the user only _where_, writes it, and returns a path — and
that is the end of the feature. Everything after it is improvised: find the file
again, open a mail client, start a message, remember the recipient's address,
type it, attach the file.

The address is the part the app almost knows. A recipient is already a named
trusted key — `trusted-keys.json` holds `{ fingerprint, label, sign, box }`
(share.js:220-222) and `share:listTrusted` projects it down to
`{ fingerprint, label }` (share.js:243) — so the app can say "Ana (work laptop)"
but has nowhere to put `ana@example.com`. The label is a nickname for a key, and
the one fact needed to deliver the file is missing from it.

### Neither list survives thirty recipients

Both surfaces that show trusted keys were written for the handful you get after
swapping keys with two colleagues, and neither has anything that degrades
gracefully past that.

`ShareDiffDialog.vue:58` renders `<ul class="recipients">` — every trusted key,
unbounded, in a `width="400px"` dialog (line 55), with no search, no scroll cap
and no ordering (`readTrusted` returns them in insertion order, since
`storeTrusted` pushes, share.js:220-222). At thirty keys that is a dialog taller
than the window whose Create-file button has left the screen, and the only way
to find someone is to read all thirty labels. `TrustedKeysDialog.vue:61` has the
same unbounded `<ul>` at `width="460px"`; it prints a count (line 59), which is
the one acknowledgement anywhere that the list has a length.

Adding an address per key makes this worse, not better — a row grows a third
line, so the same thirty keys occupy roughly half again the height.

Scale is therefore part of this change rather than a follow-up: a feature whose
whole point is picking the right person cannot ship with a picker that cannot
find them.

### The clipboard can only carry text, and the file is the thing you need

The hand-off ends with a drag: Finder opens with the sealed file selected, and
the user drags it into the mail draft. That is one gesture more than it should
be, and it is the gesture that fails — the two windows have to be arranged so
both are visible.

The clipboard is the obvious answer and the app cannot currently use it.
`clipboard:write` (clipboard.js:10) takes a string and nothing else;
`image:copy` (diffImage.js:106) writes a `nativeImage`. There is no way to put a
**file** on the clipboard, so "copy this and paste it into the message" is not
available for a `.diffbro` — or for anything else.

The read direction, notably, is already solved and solved well:
`clipboardFiles.js` decodes `NSFilenamesPboardType`, `CF_HDROP`,
`text/uri-list` and four more flavours to support paste-to-compare. Only the
write counterpart is missing.

The same gap shows up away from email. Copying a snippet gives you its text,
which is right when you are pasting into an editor and wrong when the
destination wants a file — a chat window, a mail draft, a folder. The two are
different intents and the app currently only expresses one, unlabelled: the
`copy-diff` command (commands.js:36) copies a unified patch as text, and nothing
says so.

### One structural constraint

**`share.js` cannot grow.** `legacySize.mjs:14` pins it at exactly
`{ fn: 267, file: 568 }` and the ratchet permits not one line more, so a new
`share:setTrustedEmail` handler cannot live where every other trusted-key
handler lives.

## Solution

**Diff Bro never sends anything. It hands off.**

Pressing _Email this diff_ does four things and then gets out of the way:

1. Seals the diff exactly as today — same `sealEntry`, same forced filename,
   same audience binding — and writes it where the user chooses.
2. Opens the user's own mail client on a new message, addressed to the
   recipients' stored addresses, with a subject and note already written.
3. Puts the sealed file **on the clipboard as a file**, so it goes into the
   draft with ⌘V.
4. Reveals it in Finder / Explorer as the fallback, for the desktops where a
   file paste does not land.

The user presses Send in their own mail client. **No socket is opened by this
app**, so hard security rule 1 is untouched, not amended — the offline
guarantee, the kill switch, the CSP, `sandbox`, `contextIsolation`, the deny-all
permission handler and the `will-navigate` block all stand exactly as they are,
and `README.md`'s "Zero network" stays true. There is no new dependency to
audit, no credentials to store, and nothing that can fail at 3am because Google
rotated an app password.

**Email is transport, never a second crypto path.** What the user attaches is
the byte-identical file `sealEntry` already produces — sign-then-encrypt, bound
to the audience, filename forced to a hash of its own ciphertext. The recipient
must still be a trusted key; an email address is a _delivery hint attached to_
an identity, never a substitute for one. The crypto surface of this feature is
**zero**: `sealing.js`, `vaultCrypt.js` and `snippetSealing.js` are not opened.

### Why the file is copied rather than attached

`mailto:` cannot carry an attachment. The `attach=` parameter was never
standardised, no mainstream client honours it today, and the clients that once
did turned it into a local-file exfiltration vector — which is why
`linkPolicy.isSafeMailtoUrl` **rejects** a `mailto:` carrying one rather than
merely ignoring it.

So the hand-off puts the sealed file **on the clipboard as a file** and reveals
it in Finder as the fallback. The user pastes into the open draft — ⌘V, not a
window-arranging drag. The copy is the primary because it is one keystroke in a
window the user is already looking at; the reveal stays because a paste can fail
silently on an unusual desktop and the file must still be findable.

The UI says exactly what happened, and never implies an attachment appeared:
_"Your message is open in Mail and the sealed file is on the clipboard — paste
it in."_

### Copy content and Copy as file are two commands, not one

`clipboard:write` writes text. **Copy as file** stages a real file and writes
the OS file flavours, the write counterpart to the read side
`clipboardFiles.js` already implements:

| platform | flavour written                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| macOS    | `NSFilenamesPboardType` as an **XML** plist (accepted on write; the binary form is only needed for reading), plus `public.file-url`  |
| Windows  | `CF_HDROP` — a 20-byte `DROPFILES` header and a double-null-terminated UTF-16 path list, exactly the layout `pathsFromHdrop` decodes |
| Linux    | `text/uri-list`, plus `x-special/gnome-copied-files` (`copy\nfile:///…`)                                                             |

**This needs a spike before it is committed to.** Electron's `writeBuffer` is
one format per call and on some platforms a second call replaces the first, so
"write three flavours atomically" may not be expressible — and `CF_HDROP` via
`writeBuffer` is the least-travelled path of the three. Step 1 is a throwaway
build that copies a file and pastes it into Mail, Finder, Slack and Explorer on
both platforms. **If a platform cannot be made to work, Copy as file is
disabled there and says so** — a menu item that silently does nothing is worse
than one that is not offered. The email hand-off keeps the Finder reveal
regardless, so nothing else in this spec depends on the spike's outcome.

**Where the two commands appear, and what each does:**

| surface              | Copy content                         | Copy as file                                                        |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Snippet row / editor | the snippet text (today's behaviour) | a file named from the snippet, extension from its detected language |
| Quick look-up result | the snippet text                     | same                                                                |
| Saved diff           | the unified patch (`copyDiff`)       | that patch as `<name>.patch`                                        |
| Sealed share         | —                                    | the `.diffbro`, forced filename preserved                           |

The existing `copy-diff` command is **renamed in its label only** — "Copy diff"
becomes "Copy diff as text" — so the pair reads as a pair. Its id, its handler
and its accelerator are untouched, so `commands.test.js` and every menu entry
keep resolving.

### Staging, and the thing that makes it a security question

A file on the clipboard is a **path**, so the bytes have to exist on disk for as
long as a paste might happen. Staged files live in a directory under
`app.getPath('temp')` created `0o700`, and:

- the staging directory is emptied on `will-quit` and on next launch;
- a staged file older than 30 minutes is pruned whenever a new one is staged;
- names are sanitised through the existing slug rule (`keyFileBasename`,
  share.js:199-201) so a snippet titled `../../x` cannot escape the directory.

**Copying a snippet as a file writes its plaintext to disk.** Every snippet is
AES-GCM encrypted at rest with the key behind the OS keychain, and this
deliberately steps outside that for as long as the staged copy lives. Two
consequences, both decided rather than discovered later:

- **A secret snippet refuses Copy as file.** `isSecret`
  (secretSnippet.js:22) already marks them, and their whole point is that the
  contents never land where they can be read — "copying still works without ever
  showing them" (secretSnippet.js:8) is true of the text clipboard, which is
  volatile, and not of a file on disk. Copy content still works, unchanged.
- **A sealed `.diffbro` is not affected.** It is ciphertext; staging it exposes
  nothing.

### The path never round-trips through the renderer

The obvious shape — renderer gets the path back from `share:export`, hands it to
a reveal handler — would give the renderer an arbitrary-path parameter into
`shell.showItemInFolder`. Instead, one main-process call does the whole
sequence: `mail:handoff` seals, writes, builds the `mailto:`, confirms, opens
and reveals, using the path **it** just computed. The renderer supplies
fingerprints and a note; it never supplies a path or a URL.

That needs the seal-and-write core lifted out of the capped `share:export`
handler into `shareExport.js`, which both callers then share.

### Rejected

| option                                               | why not                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-app SMTP** (an earlier draft of this spec)      | Reverses hard rule 1 for a convenience gain. It buys one saved drag and costs: a network dependency to audit, Gmail app-password storage and its failure modes, a `README.md` claim that stops being true, and a socket the existing kill switch cannot even see (see the note below). Not worth it. |
| Renderer passes the sealed path to a reveal handler  | Hands the renderer an arbitrary-path parameter into the OS file manager. Main already knows the path — it wrote it.                                                                                                                                                                                  |
| `mailto:?attach=…`                                   | Not standardised, not honoured, and historically a local-file exfiltration vector. Actively rejected by the policy, not silently dropped.                                                                                                                                                            |
| Put the address in the key file (`.diffbrokey`)      | The address would be attacker-supplied on import and would travel to third parties who were only given a public key. It is local annotation: it lives in `trusted-keys.json`, set by the person who owns that machine.                                                                               |
| Send the diff as an email body or a plain attachment | Discards the sealing model to save the recipient one import. The audience binding is the feature.                                                                                                                                                                                                    |
| A `features/email` slice owning recipients           | Recipient identity stays in `share`. Email adds one nullable field to a record that slice already owns; splitting the owner across two slices is how the diffStore grab bag started.                                                                                                                 |

> **Kept for the record, because it is the reason the SMTP route was dropped
> rather than merely deprioritised:** `installNetworkKillSwitch`
> (security.js:8) filters `session.defaultSession.webRequest`, which is Chromium
> traffic only. A main-process `tls.connect` would have been invisible to it.
> The offline guarantee holds today because nothing in main opens a socket — not
> because anything stops it. Any future proposal to add one starts from there.

### Where the code goes

`share.js` is capped, so this is also the change that beats the cap. Two
extractions, and its `legacySize.mjs` entry is **retightened, never raised**
(`node scripts/check-structure.mjs --retighten`).

| file                                                         | role                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/trustedKeys.js` _(new, extracted)_                 | owns `trusted-keys.json`, incl. the new `email`; list/rename/remove/set-email IPC                                                |
| `src/main/shareExport.js` _(new, extracted)_                 | `sealAndWrite(entry, recipientFps)` → `{ path, recipients }`; the core `share:export` and `mail:handoff` both call               |
| `src/main/mailAddress.js` _(new, pure)_                      | address validation: shape, length cap, **CR/LF rejected** so a stored address cannot inject a second header                      |
| `src/main/mailto.js` _(new, pure)_                           | builds the `mailto:` URL — `URLSearchParams` encoding, recipient list, subject, body, total length cap                           |
| `src/main/mail.js` _(new, glue)_                             | `mail:handoff` — seal → build → confirm → `openExternal` + copy + reveal. The only file that touches `shell` here                |
| `src/main/clipboardWrite.js` _(new, pure)_                   | builds the OS file flavours — the write counterpart to `clipboardFiles.js`. Returns buffers, so it is unit-testable              |
| `src/main/clipboardStage.js` _(new)_                         | the `0o700` staging directory: write, sanitise the name, prune by age, empty on quit                                             |
| `src/main/clipboardCopy.js` _(new, glue)_                    | `clipboard:writeFile` — stages bytes and writes the flavours. **Never accepts a path from the renderer**                         |
| `src/main/linkPolicy.js`                                     | `isSafeMailtoUrl` — scheme `mailto:` only, no `attach`/`attachment` parameter, bounded length                                    |
| `src/main/links.js`                                          | unchanged in behaviour; `mail.js` reuses its confirm-before-`openExternal` shape                                                 |
| `src/main/shareCore.js`                                      | `isTrustedEntry` accepts an optional `email`; a malformed one drops the field, never fails the restore                           |
| `src/renderer/src/utils/recipientSearch.js` _(new, pure)_    | ranks trusted keys for a query by **reusing `rank()`** (quickLook.js:36) — the scorer already behind the palette and the sidebar |
| `src/renderer/src/composables/useRecipientPicker.js` _(new)_ | query state, active row, and the keyboard guards — extracted so they are unit-tested rather than left inline in a `.vue`         |
| `src/renderer/src/styles/ui.css`                             | the search field lifts out of `SidebarSearch.css` into a shared `.field-search`; three components need it now                    |
| `src/renderer/src/features/email/` _(new slice)_             | `emailStore.js`, `index.js`, `components/EmailSettings.vue`, `components/EmailHandoffDialog.vue` + styles                        |
| `src/renderer/src/features/share/`                           | `ShareDiffDialog` gains the delivery step **and the picker at scale**; `TrustedKeysDialog` gains the address and search          |
| `src/renderer/src/components/SettingsDialog.vue`             | one `TABS` row + one `<EmailSettings>` branch                                                                                    |

**Slice direction is `share → email`, never back.** `share` owns recipients and
sealing; `email` owns the message defaults and the hand-off dialog, and knows
nothing about keys or the vault. `EmailSettings.vue` is reached from
`SettingsDialog.vue`, a core _component_ — allowed, and exactly what
`AppDialogs.vue:4` already does with `imageExport`. No cycle for
`check-structure.mjs` to catch.

## Scope

**In:**

- An optional email address per trusted key, edited in Trusted keys.
- A delivery step on the existing share flow: **Save file** (unchanged) and
  **Email this diff** (seal → mail client → clipboard + reveal).
- **Search and scroll caps on both recipient lists**, and selected recipients
  that a filter cannot hide.
- **Copy as file**, differentiated from Copy content, on snippets, saved diffs
  and the sealed share — gated on the platform spike.
- Settings → Email: the message defaults and the reveal behaviour.
- Failure states that name what failed: no address on a ticked recipient, no
  registered `mailto:` handler on the machine, user cancelled at the confirm,
  Copy as file unsupported on this platform.

**Out:** _(recorded, not drifted into)_

- **Any sending.** No SMTP, no credentials, no network. See the rejected table.
- **Snippets by email.** Snippet bundles seal with a passphrase
  (`sealSnippets(bundle, passphrase, sender)`, snippetSealing.js:145), not a
  recipient key — mailing one means mailing the secret that unlocks it, on the
  same channel. Snippets become mailable when snippet sealing becomes
  key-addressed; that is its own spec. **This narrows the original request** and
  is the one part of it not delivered.
- Reading a contact book, or any address the user did not type.
- A sent-items record, delivery confirmation, or receiving mail — the app never
  learns whether the message was sent.
- **Recently-shared-with ordering.** At thirty recipients, floating the last few
  you sent to above the alphabetical list is the obvious next improvement, and
  it is cheap — `lastSharedAt` on a record this change is already touching.
  Considered and left out because it is a behaviour change nobody asked for and
  it would make the list order non-deterministic under test. Recorded here so
  the next person finds the reasoning rather than the gap.
- **Recipient groups / teams.** A saved set of fingerprints ticked in one click.
  Genuinely useful past thirty, but it is a second data structure with its own
  storage, editing UI and restore validation — its own spec.
- **Copy as file for a secret snippet.** Refused by design; see the staging
  section. Copy content is unchanged for those.
- **Drag a snippet or diff out of the app onto the desktop.** The same staging
  machinery would serve it, and it is the natural follow-up, but drag sources
  are a different event surface from the clipboard and would double this spec's
  e2e surface.

> **This spec now covers three things** — the email hand-off, the recipient
> lists at scale, and Copy as file. They share the same files (`ShareDiffDialog`,
> `trustedKeys.js`) and the hand-off's primary gesture _is_ Copy as file, which
> is the repo's stated bar for sharing a branch. It is still large. **If it
> should split, the clean seam is Copy as file** — steps 1 and 8-10 lift out to
> their own spec on the same branch, and the hand-off falls back to the Finder
> reveal it already keeps as its fallback. Flagged for the approval, not decided
> unilaterally.

## Design

Four surfaces, all built from existing classes: `.dialog-form`, `.field-label`,
`.dialog-note`, `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-sm` /
`.btn-icon`, `.section-inset`, `--control-h`, `--chip-h`, `<AppIcon>`. New icons:
`mail`, `folder-open`. No new component pattern and no new dialog component —
`EmailHandoffDialog` is a `BaseDialog` with `width="420px"`.

### 1 · Settings → Email

An eighth row in `TABS` (SettingsDialog.vue:20-28), between Logs and Terminal.
With no credentials to hold, the pane is small — three controls:

- **Subject** — the template used for a new message. Placeholders `{name}` and
  `{expires}` resolve from the diff. Default: `Sealed diff: {name}`.
- **Note** — optional standing text prefilled into the body, above the generated
  line that tells the recipient what the file is and how to open it.
- **Reveal the sealed file after creating it** — `SettingToggle`, on by default.
  Off suits someone who always saves to the same folder and does not want a
  Finder window each time.

> **This pane is thin, and that is worth a decision at review.** It exists
> because the request named it; with SMTP gone it holds three preferences. The
> alternative is folding these into a **Sharing** pane alongside the default
> expiry and the default save folder, which is where a reader would look for
> them. **Recommendation: keep Email for now**, and merge it into Sharing the
> moment a second sharing preference wants a home — a one-item pane is worse
> than either.

### 2 · Trusted keys — an address per key, and a list that holds thirty

`TrustedKeysDialog.vue` rows currently stack `label` over `fingerprint`. A third
line joins them: the address, or a `.btn-sm` **Add email** when unset, edited
in-place by the same `startRename` / `commitRename` pattern the dialog already
uses. A key with no address is not broken — it just cannot be an email target,
and the share dialog says so at the point it matters.

The list itself gets the three things it needs at scale, and no more:

- **A search field** in the header band — the same control as the sidebar's,
  matching on label, address and fingerprint.
- **A scroll region** capped at `max-height: 300px` (about six three-line rows),
  so the dialog stops growing and its Add-key button never leaves the screen.
- **Alphabetical order by label**, case-insensitive, replacing insertion order.
  Sorting happens in the renderer, so `trusted-keys.json` keeps its existing
  on-disk order and nothing about the crypto path notices.

The existing count line becomes `12 of 30` while a query is active — the only
honest way to say a list is filtered.

### 3 · Picking one of thirty — the recipient picker

This is the surface that actually breaks at scale, and it needs one idea beyond
"add a search box": **a filter must never hide a choice you have already made.**
Type `tom` after ticking Ana and Ana leaves the viewport; press Create file and
you have sealed for someone you can no longer see. So the picker is two regions,
and only the lower one filters:

```text
┌─ Share diff ─────────────────────────────┐
│  Seal for                                │
│  ┌────────────────────────────────────┐  │
│  │ ⌕  tom                          ×  │  │   .field-search (shared, ui.css)
│  └────────────────────────────────────┘  │
│  ☑ Ana — work laptop   ×   ☑ Rūta   ×    │   ← selected chips, NEVER filtered
│  ─────────────────────────────────────   │   ← 1px --border, not a fade
│  ☐ Tomas — build box      tomas@…        │   ┐
│  ☐ Tomas Ž. — laptop      no address     │   │ scrolls, max-height 240px
│  ☐ Automation — CI signer no address     │   ┘
│  2 of 30                    Add recipient…│
│  ────────────────────────────────────────│
│  Sealed for 2      [Email this diff] [⋯] │
└──────────────────────────────────────────┘
```

- **Selected chips sit above the divider and ignore the query.** They are the
  running answer to "who am I sealing this for", they carry an `×` to
  un-tick, and at 30 recipients they are also the only review step that matters
  — better than a confirmation dialog, because it is always on screen rather
  than only at the end.
- **The scroll region caps at 240px** (eight rows), so the dialog is a fixed
  height whether you have three trusted keys or thirty.
- **Ranking reuses `rank()`** (quickLook.js:36) through a new pure
  `utils/recipientSearch.js`, which projects a key to the shape the scorer
  already understands — `{ name: label, tags: [email, fingerprint] }`. Label
  prefix beats label substring beats address or fingerprint substring, which is
  the same ordering the palette and the sidebar give, so all three search
  surfaces agree on what a query finds. That agreement is already the stated
  intent at quickLook.js:1-2; this is the third caller, not a new scorer.
- **`With an address only`** — a `.btn-sm` toggle beside the field, on by
  default when the flow was entered from Email this diff. It is the fastest way
  to answer "who can I actually mail this to" out of thirty.
- **Keyboard, and it is a real requirement at this size:** the field keeps focus
  and holds the caret; `↑`/`↓` move an active row through the _filtered_ list;
  `Space` toggles it; `Enter` submits; `Escape` clears a non-empty query first
  and closes the dialog second. That two-stage Escape is exactly the class of
  event guard `docs/standards.md` says must not be left inline in a `.vue` —
  it goes into `composables/useRecipientPicker.js` and is unit-tested there,
  following `useBackdropClose`.
- **Empty state:** `No one matches "xyz"` with the `Add recipient…` button
  directly under it, since not-found and need-to-add are the same moment.

The first-time-setup branch (`ShareDiffDialog.vue:93`) is untouched — with zero
trusted keys there is nothing to search.

### 4 · Share → deliver

`ShareDiffDialog`'s footer becomes the delivery choice. The primary is what the
user can actually do right now:

| state                                 | primary             | secondary       |
| ------------------------------------- | ------------------- | --------------- |
| every ticked recipient has an address | **Email this diff** | Save file       |
| any ticked recipient has no address   | **Save file**       | Add an address… |

**Email this diff** opens `EmailHandoffDialog`: To (chips, pre-filled,
**read-only** — addresses come from trusted keys, never typed here), Subject,
the note, and a preview of what will happen. Its primary reads **Create &
open mail** — because that is the two things it does, and a button that says
"Send" when the app does not send is a lie.

### The three-step confirmation, and why it is not friction

After the file is written, main raises the standard
`dialog.showMessageBox` — the same fence `link:open` uses — naming the mail
client handoff before the OS is handed anything. Then both windows appear. The
toast that follows states the fact, not the posture:

> Your message is open in Mail and `3f9c1ab2…diffbro` is on the clipboard —
> paste it in and send.

…falling back to _"…is selected in Finder — drag it in"_ where the spike says
Copy as file cannot be trusted.

No padlock chip, no "stays on this machine". The offline guarantee is not
mentioned here at all; nothing about this flow is a security decision the user
is making, so `docs/standards.md`'s never-re-sell-the-guarantee rule applies in
full.

### 5 · Copy content vs Copy as file

Two commands wherever content can be copied, and the labels are the whole
design — a user who cannot tell them apart will pick wrong every time.

|                | Copy content                        | Copy as file                                         |
| -------------- | ----------------------------------- | ---------------------------------------------------- |
| **label**      | "Copy content", "Copy diff as text" | "Copy as file"                                       |
| **icon**       | `copy`                              | `file`                                               |
| **what lands** | characters                          | a file, pasteable into Mail, Finder, Slack, Explorer |
| **hint**       | —                                   | `Paste into a message or a folder`                   |

They sit **adjacent** in every menu, palette entry and hover-action row — never
in different groups, never one behind a submenu — because adjacency is what
makes them read as a choice between two things rather than two unrelated
actions. Both are rows in `utils/commands.js` per the feature rules, not new
store actions.

`copy-diff`'s label becomes "Copy diff as text". Its **id, handler and
accelerator are untouched**, so `commands.test.js`, `menus.js` and the palette
keep resolving; only the string a human reads changes.

The toast names the file, because "Copied" alone cannot tell the two apart:
`config-v2.json copied as a file — paste it where you need it.`

**Where Copy as file is unavailable it is not rendered**, with one exception:
on a secret snippet it renders **disabled** with the reason on its tooltip
(`Secret snippets can't be copied as a file — use Copy content`). An absent
control is a mystery; a disabled one with a reason is an answer, and this is the
one case where the user would otherwise hunt for it.

### Theme verdict — all 14

Values parsed from `styles/themes.css`; ratios computed against each theme's
raised surface (`--bg-panel`, or `--bg` on light, which inverts). **This table
changed the design twice** — see the two findings under it.

| theme    | ground | `--success-text` | `--danger-border` | `--warning-border` | verdict | note                                             |
| -------- | ------ | ---------------- | ----------------- | ------------------ | ------- | ------------------------------------------------ |
| light    | light  | 5.08             | 5.36              | 3.14               | pass    | floating-canvas inversion; card on `--bg-raised` |
| dark     | dark   | 6.81             | 3.75              | 3.55               | pass    | danger under 4.5 → finding 1                     |
| solar    | light  | **3.09**         | 4.90              | 3.08               | pass    | success under 4.5 → finding 1                    |
| neon     | dark   | 10.16            | 4.82              | 7.45               | pass    | accent `#22d3ee` — keyline only, no glow         |
| nord     | dark   | 4.94             | **1.80**          | 4.53               | pass    | danger all but invisible → finding 1             |
| sepia    | light  | **3.61**         | 4.71              | 3.13               | pass    | success under 4.5 → finding 1                    |
| dim      | dark   | 8.84             | 3.60              | 4.48               | pass    | danger under 4.5 → finding 1                     |
| beacon   | dark   | 11.39            | 4.23              | 6.42               | pass    | hard keyline `#e0e0e0` on `#000000` kept         |
| meridian | light  | 4.75             | 6.44              | 3.28               | pass    |                                                  |
| linen    | light  | 5.19             | 6.58              | 3.51               | pass    |                                                  |
| bloom    | light  | **4.19**         | 5.75              | 3.42               | pass    | success under 4.5 → finding 1                    |
| nyan     | dark   | 13.36            | 4.12              | 7.76               | pass    | accent `#ff2ecb` — keyline only                  |
| matrix   | dark   | 13.92            | 4.45              | 8.38               | pass    | `--accent` **is** `--success-text` → finding 3   |
| contrast | light  | 5.57             | 7.97              | **2.74**           | pass    | hard keyline `#111111` kept → finding 2          |

**Finding 1 — state colour cannot carry state.** `--success-text` misses the
4.5:1 text floor on solar (3.09), sepia (3.61) and bloom (4.19);
`--danger-border` misses it on nord (1.80), dim (3.60) and dark (3.75). nord is
the same failure `--dg-del` already works around (tokens.css:96). So **a status
or result line puts its label in `--text`, and colour lives only on the
`<AppIcon>` and the keyline**, where the floor is 3:1 and every theme clears it.
Legible as a shape before it is legible as a colour — the colour-blind answer,
and the reasoning `--dg-add`/`--dg-del`/`--dg-chg` are already built on.

**Finding 2 — an advisory strip cannot use `--warning-border`.** It scores 2.74
on contrast, under the 3:1 non-text floor, and themes.css:453 already records
this for `--dg-chg`. The "paste it in" strip uses a 3px `--warning-bg` left bar —
a saturated fill, not a hairline — with body text in `--text`.

**Finding 3 — no accent tint on a success state.** On matrix `--accent` and
`--success-text` are both `#00ff41`, so an accent-tinted glow would be a halo of
one colour; neon, nyan and matrix turn accent glows into halos generally. A
result is a keyline plus an icon, never a fill or a shadow.

**Finding 4 — a scrolling list gets a rule, not a fade.** The usual affordance
for "there is more below" is a gradient from the surface colour to transparent.
It cannot work here: the rows are `--bg-raised` cards sitting on a `--bg-panel`
dialog, so the fade would have to pick one of the two and would smear over the
other on half the palettes — and on `contrast` (`--border: #111111`) and
`beacon` (`#e0e0e0`) a soft edge is disqualified outright, since those two
carry a hard-keyline contract rather than a palette. So the scroll region is
bounded by **1px `--border` rules** top and bottom, which every theme already
renders correctly, and overflow is signalled by a partially-visible row rather
than by a gradient. The same rule separates the selected chips from the
filtered list.

## Security rules touched

Four of the eight, and **rule 1 is not one of them**.

| rule                                                  | how it stays inside                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · offline**                                       | **Untouched.** The app opens no socket. Handing a `mailto:` to the OS is the same class of act as `link:open` already performs, and the guarantee has always been about this process, not about what the user's own browser or mail client then does. `README.md`'s "Zero network" stays true and needs no edit.                                                                    |
| **2 · dependency audit**                              | **No new dependency.** `mailto.js` is `URLSearchParams` and a length cap.                                                                                                                                                                                                                                                                                                           |
| **3 · renderer isolation**                            | The renderer never touches `shell`, `fs` or a path. It calls `window.api.mailHandoff(recipientFps, note)` and gets `{ ok }` or an error code.                                                                                                                                                                                                                                       |
| **6 · hostile input**                                 | Addresses are validated in main (`mailAddress.js`), not by an HTML `type="email"`: CR/LF rejected so a stored address cannot inject a `Bcc:` header into the constructed URL, length capped, one address per recipient. A restored config's `email` fields go through `shareCore.isTrustedEntry` — a malformed one drops that field rather than failing the restore.                |
| **3 · renderer isolation (again, for the clipboard)** | `clipboard:writeFile` takes **bytes and a display name**, never a path. The renderer cannot name a file to stage, read one back, or learn the staging directory — see the Copy-as-file paragraph below.                                                                                                                                                                             |
| **7 · leaving the sandbox**                           | **This is the section to read at review.** `mailto:` is the **third** `shell.openExternal` call site and gets the full treatment: built in main from validated parts, checked by `linkPolicy.isSafeMailtoUrl`, confirmed in a `dialog.showMessageBox`. `shell.showItemInFolder` is a **new** sandbox-leaving surface not covered by the existing wording — see the two notes below. |

**On `shell.showItemInFolder`.** It reveals, it does not execute — but it still
hands a path to the OS, so it is fenced the same way: the path is the one
`shareExport.sealAndWrite` just returned, computed in main, never supplied by
the renderer and never round-tripped through it. There is no IPC handler that
reveals an arbitrary path, and adding one later would need the same review as a
third `openExternal` site did.

**Rule 7's wording needs one line.** It currently enumerates exactly two
`openExternal` call sites. This change makes it three and introduces
`showItemInFolder`, so `docs/standards.md` rule 7 is updated in the same commit
— not to weaken it, but because a rule that no longer matches the code is a rule
nobody trusts.

**Copy as file needs its own paragraph, because it is the one place this change
weakens a property the app otherwise holds.** Snippets are AES-GCM encrypted at
rest; a staged copy is not. The fences:

- **`clipboard:writeFile` never takes a path.** It takes bytes plus a display
  name, both of which main already holds, and returns nothing but `{ ok }`. The
  renderer cannot name a file to stage, cannot read one back, and cannot learn
  the staging directory.
- **The name is sanitised, not trusted.** A snippet titled `../../.ssh/config`
  slugs to a flat filename through the same rule `keyFileBasename` uses.
- **`0o700`, pruned at 30 minutes, emptied on quit and on next launch** — the
  double sweep because a crash skips `will-quit`, and a plaintext snippet
  surviving a reboot in `/tmp` is the failure that matters.
- **Secret snippets refuse it** (`isSecret`, secretSnippet.js:22).
- The staging directory is **not** `tests/data/`; the workflow rule about
  cleaning temp artifacts is unaffected, and the e2e uses a throwaway
  `--user-data-dir` as every spec already does.

Rules **4** (keys never cross IPC) and **5** (crypto invariants) are untouched:
no key material moves and `sealing.js` / `vaultCrypt.js` / `snippetSealing.js`
are not opened. Rule **8** (injection sinks) is untouched — every new string
renders through Vue text interpolation.

## Test plan

Written before the code. Everything below is a new file unless marked.

**unit**

- `tests/main/mailAddress.test.js` — `a@b\r\nBcc: evil@x` rejected; oversize
  local part, empty, missing `@`, leading/trailing space, non-string.
- `tests/main/mailto.test.js` — encoding of `&`, `?`, `#`, newline and unicode
  in subject and body; multiple recipients joined correctly; total length cap;
  **an `attach` parameter is never constructible**; a note containing a URL
  cannot add a second parameter.
- `tests/main/linkPolicy.test.js` _(extend)_ — `isSafeMailtoUrl`: `mailto:`
  only; `javascript:`, `file:`, `http:` refused; `mailto:x@y?attach=/etc/passwd`
  refused; over-length refused.
- `tests/main/shareExport.test.js` — extraction keeps `share:export` behaviour;
  the returned path's basename equals `shareFilename(file)`.
- `tests/main/trustedKeys.test.js` — extraction keeps existing behaviour;
  set/clear email; an unknown fingerprint is refused; an invalid address is
  refused before it reaches disk.
- `tests/main/shareCore.test.js` _(extend)_ — a restored entry with a malformed
  `email` loses the field and keeps the key; one with a valid email keeps both.
- `tests/renderer/features/email/emailStore.test.js` — subject template
  resolution; a hand-off with a recipient lacking an address is refused **before
  IPC**, with the message naming which recipient.
- `tests/renderer/utils/recipientSearch.test.js` — label prefix outranks label
  substring outranks address substring outranks fingerprint; an empty query
  returns input order untouched; a query matching nothing returns `[]`;
  diacritics (`Rūta` found by `ruta`) — the same folding `rank` already applies.
- `tests/renderer/composables/useRecipientPicker.test.js` — **the regression
  this whole design exists to prevent: a selection survives a query that
  excludes it, and submitting after filtering seals for the selection, not the
  visible rows.** Plus: `↑`/`↓` wrap within the filtered list; `Space` toggles
  the active row without typing a space into the field; the two-stage `Escape`
  clears a non-empty query and only then closes.
- `tests/main/clipboardWrite.test.js` — round-trips against the **existing
  readers**, which is the strongest assertion available here: a `CF_HDROP`
  buffer this module builds is decoded back to the same path by
  `pathsFromHdrop`; likewise `pathsFromPlist` and `pathsFromUriList`. Plus:
  a path with a space, a non-ASCII name, and the UTF-16 flag set correctly.
- `tests/main/clipboardStage.test.js` — `../../.ssh/config` slugs to a flat name
  inside the staging dir; a file older than 30 minutes is pruned when the next
  is staged; the directory is created `0o700`; emptying is idempotent.

**e2e** — two specs. Real launch, real preload, real IPC.

`e2e/email-handoff.spec.mjs` — `shell.openExternal` and `shell.showItemInFolder`
are stubbed in the test build only (nothing on a developer's machine gets a
Finder window or a mail draft), and the spec asserts on what main passed them:

1. Trusted keys → assign an address → reopen → it persisted.
2. Share a saved diff → Email this diff → confirm → the sealed file exists on
   disk, `openExternal` received a `mailto:` whose `to` is the stored address
   and whose subject came from the template, and the reveal received **that same
   path**.
3. Cancelling at the confirm leaves the file written and opens nothing.
4. A recipient with no address cannot reach the hand-off at all.
5. **With 30 trusted keys seeded**: the dialog does not exceed the window
   height, typing filters the list, a recipient ticked before the query is still
   ticked after it, and Create file seals for exactly that recipient. This is
   the layout assertion jsdom cannot make — a measured bounding box, not a
   screenshot.

`e2e/copy-as-file.spec.mjs` — the clipboard is the one thing only a real launch
exercises, and it is why `copyText` exists in the first place:

1. Copy a snippet as a file → **read it straight back with the app's own
   `clipboardFilePaths`** → the path exists, and its bytes equal the snippet.
   The read side is already trusted and tested, which makes it the right oracle.
2. Copy content on the same snippet → the text flavour holds the snippet, and no
   file flavour was written.
3. A secret snippet offers Copy content and a disabled Copy as file.
4. Staged files are gone after the app quits.

**red → green** — no bug is being fixed, so there is nothing to watch fail
first. Three invariants get the revert-and-watch treatment instead, because a
test that has never failed guards nothing: remove the CR/LF rejection and see
`mailAddress.test.js` fail; let `isSafeMailtoUrl` accept an `attach` parameter
and see `linkPolicy.test.js` fail; make the picker submit its **visible** rows
instead of its selection and see `useRecipientPicker.test.js` fail. All three
recorded in Validation.

**seed fixtures** — `scripts/seed-local.mjs` gains a **30-trusted-key** fixture
behind a flag, because the scale problem cannot be seen by hand otherwise and
`make local-seed` is the only way it is opened on the host Mac. Keeps the `seed`
tag; confirm `local-seed-clean` removes exactly what it wrote. No new file
format and no changed shape on disk beyond one optional string in
`trusted-keys.json`.

**Docker / themes** — all five surfaces screenshotted across all 14 themes,
including the picker with 30 keys and a scrolled list.

## Steps

- [x] 1 · **Clipboard-file spike** — throwaway build; copy a file and paste it
      into Mail, Finder, Slack and Explorer on macOS **and** Windows. Record
      per-platform what worked. **Gates steps 8-10 only**; everything else is
      independent of the outcome
- [x] 2 · Extract `src/main/trustedKeys.js` from `share.js`; tests stay green;
      `--retighten` the `legacySize.mjs` entry
- [x] 3 · Extract `src/main/shareExport.js` (`sealAndWrite`) from
      `share:export`; `--retighten` again
- [x] 4 · `mailAddress.js` + `mailto.js` + `linkPolicy.isSafeMailtoUrl` + tests
- [x] 5 · `mail.js` — `mail:handoff`: seal → build → confirm → open → copy →
      reveal, with the stub seam for e2e
- [x] 6 · `email` field in `trustedKeys.js` + `shareCore` validation + preload
- [x] 7 · `utils/recipientSearch.js` + `composables/useRecipientPicker.js` +
      their tests — **written before either dialog is touched**, since they are
      what the dialogs become
- [x] 8 · `clipboardWrite.js` + `clipboardStage.js` + tests
- [x] 9 · `clipboardCopy.js` — `clipboard:writeFile`, quit + launch sweeps,
      preload; per-platform capability flag from step 1
- [x] 10 · Copy-content / Copy-as-file command pairs in `utils/commands.js`,
      `menus.js` and the hover-action rows; `copy-diff` relabelled
- [x] 11 · `.field-search` lifted into `ui.css`; `SidebarSearch.vue` re-pointed
      at it so there is one copy, not two
- [x] 12 · `features/email/` slice — store, `index.js`, tests
- [x] 13 · `EmailSettings.vue` + styles; `SettingsDialog.vue` tab row
- [x] 14 · `EmailHandoffDialog.vue` + styles
- [x] 15 · `TrustedKeysDialog.vue` — address line, inline edit, search, scroll cap
- [x] 16 · `ShareDiffDialog.vue` — the picker at scale + the delivery footer
- [x] 17 · Seed fixture: 30 trusted keys behind a flag (`make local-seed-many`),
      two of them deliberately WITHOUT an address so the Create-file fallback and
      the "Add an address…" secondary are reachable without editing anything
- [x] 18 · `e2e/email-handoff.spec.mjs` + `e2e/copy-as-file.spec.mjs`
- [x] 19 · Docs, then `npm run check` + 14-theme sweep in Docker + `/validate`

## Docs impact

Far smaller than the SMTP draft's: nothing overclaims after this change, because
nothing about the offline guarantee changes.

| doc                    | stale?  | what changes                                                                                                                      |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `docs/standards.md`    | **yes** | Rule 7 — third `openExternal` site, `showItemInFolder` named as fenced, and the staging directory's plaintext window written down |
| `docs/ipc-security.md` | **yes** | `mail:handoff`, `share:setTrustedEmail`, `clipboard:writeFile`                                                                    |
| `README.md`            | **yes** | The **Share** row gains the hand-off; **Snippets** gains Copy as file. "Zero network" needs no edit                               |
| `docs/security.md`     | **yes** | Two paragraphs: the hand-off, and the staged-plaintext window with its `0o700` / 30-minute / quit-and-launch sweeps               |
| `docs/glossary.md`     | **yes** | "hand-off", "staged file", "Copy as file" vs "Copy content"                                                                       |
| `docs/architecture.md` | check   | main-process module list gains eight files                                                                                        |
| `docs/roadmap.md`      | check   | if sharing transport is listed there                                                                                              |

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
- **2026-08-04 · Staged plaintext is swept twice.** On `will-quit` and again on
  next launch, because a crash skips the first and a snippet surviving a reboot
  in the temp directory is the failure that actually matters.

## Spike result — step 1, macOS

Ran a throwaway Electron build writing the flavours `clipboardWrite.js` builds
and reading them back with the app's own `clipboardFilePaths`.

| finding                                                                                              | verdict                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| macOS accepts `NSFilenamesPboardType` as an **XML** plist on write                                   | works — the binary form is a read-side problem                           |
| A filename with non-ASCII, a space, `?` and `#` round-trips exactly                                  | `MATCH: YES`                                                             |
| Sequential `clipboard.writeBuffer` calls do **not** clear each other on macOS                        | the multi-flavour worry did not materialise                              |
| `availableFormats()` under-reports (lists only `text/uri-list`) while still serving the others       | already handled — `clipboardFilePaths` reads by content, not by the list |
| Writing `public.file-url` makes macOS regenerate `NSFilenamesPboardType` with Apple's own serialiser | harmless; the path still decodes to the same value                       |

**Windows and Linux are UNVERIFIED on this machine** — no Win32 host was
available, so `CF_HDROP` has only its round-trip against `pathsFromHdrop`
(`tests/main/clipboardWrite.test.js`) behind it, not a real Explorer paste.
`clipboard:canWriteFile` exists precisely so an unsupported platform hides the
command; the Windows leg of the spike is outstanding and is listed below rather
than quietly assumed.

## What the review and QA passes found

Two agents reviewed this after it was first pushed, and between them found **18
further defects** — enough that the first commit should not have been described
as finished. The ones worth carrying forward as lessons:

| finding                                                                                                     | why it got through                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancelling the OS **save dialog** saved a local twin and recorded a share for a file that was never written | Two different cancels reach the renderer and only one carries a `path`. **My own test asserted the bug as the contract**                                                                       |
| The two-stage Escape never ran in the real dialog                                                           | `BaseDialog` listens on WINDOW in the capture phase and calls `stopPropagation`. The unit test called `handleKey` directly — the exact "test that never failed" shape the standards warn about |
| Space in the search field silently ticked a recipient and could not be typed                                | The key table consumed `' '` unconditionally; the e2e used `fill()`, which dispatches no keydown                                                                                               |
| `revealAfterCreate` was a dead setting                                                                      | Persisted, rendered and reset — never sent over IPC                                                                                                                                            |
| A long note orphaned a sealed file and blamed the address                                                   | `too-long` was remapped to `bad-address`, and the path was dropped                                                                                                                             |
| `canWriteFile` could never return false                                                                     | The freedesktop flavours were the fallback for every unknown platform                                                                                                                          |
| Non-Latin snippet titles became `diffbro.txt`                                                               | An ASCII-only `\w` slug                                                                                                                                                                        |
| Both new e2e specs could not pass                                                                           | Wrong dialog title, wrong row class, placeholder key material that cannot seal, and a module import that does not exist in a bundled build                                                     |

## The theme sweep, and what it caught

`npm run check:themes` holds the TOKENS. It cannot see what a specific surface
renders once they are composed — a label on a chip whose background is a
`color-mix`, or a control in its unset state. So `make theme-sweep` walks each
new surface through all 14 themes, reads the **computed** colours off the live
DOM, and holds every pair that carries meaning to a floor declared per probe.

It found one real defect: the **unset "Add email" state** used `--text-dim` and
scored **3.44 on sepia**, 3.99 on solar, 4.05 on nord, 4.31 on bloom. That state
is a call to action, not de-emphasised metadata, so it moved to `--text-hint` —
the token `themes.css` describes as "for hint text that must stay readable".
Worst score is now 7.74.

The floors are declared per probe rather than inferred from the probe's name: a
regex over the name matched `field label` to the non-text floor by accident,
which is exactly how a real failure goes quiet. `--text-dim` micro-labels are
held at **3.0**, because `check-theme-depth.mjs:134` pins `dim/panel` there as a
deliberate ratchet and a stricter floor here would contradict the repo's own
gate.

## Validation

- [x] `npm run check` clean — 2189 tests, coverage 95.37 / 87.64 / 96.32 / 96.45
      against floors 93 / 86 / 92 / 95
- [x] `share.js` under its retightened cap after **both** extractions; no
      `legacySize.mjs` number raised. Five caps were BEATEN and retightened:
      `share.js` 267→225 fn / 568→510 file, `menu.js` 216→204 / 313→302,
      `menus.js` 190→181, `diffStore.js` 787→783, `vaultStore.js` 433→408
- [x] `check-structure.mjs` reports no new cycle (`share → email` only)
- [x] No socket — asserted in `tests/main/mail.test.js`, not just grepped
- [x] No IPC handler accepts a filesystem path from the renderer. A `mail:copySealed`
      handler that did was written and then deleted during the build
- [x] The picker's revert-and-watch check seen red (3 failures for the right
      reason), then green. The two mailto/address ones were proven differently:
      both invariants FAILED on first run before the code was corrected
- [x] Spike outcome recorded per platform (above). **Windows leg outstanding** —
      and `fileFlavours` now returns `[]` for an unknown platform, so
      `canWriteFile` can actually be false. It could not before: the freedesktop
      pair was the unconditional fallback, which made the whole "an unsupported
      platform hides the command" story a no-op
- [x] Staging sweep covered by `tests/main/clipboardStage.test.js` and
      `e2e/copy-as-file.spec.mjs`
- [x] Picker verified with 30 seeded keys in `e2e/email-handoff.spec.mjs`:
      dialog measured against the window, selection survives a filter
- [x] 14 themes swept — and MEASURED, not eyeballed: `make theme-sweep` reads the
      computed colours off the live DOM in every theme and holds each pair to a
      declared floor (`scripts/theme-sweep.mjs`). **126 measurements, all clear.**
      Images in `docs/screenshots/themes/`
- [x] `docs/standards.md` rule 7 matches the code's `openExternal` call sites
      exactly (three). It now also names `logger.js`, which reaches
      `showItemInFolder` and `shell.openPath` and was never covered by the rule
