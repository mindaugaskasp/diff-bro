# DiffBro — glossary

Plain-language definitions of the terms and abbreviations used across the code,
comments, and the other docs. Grouped by area. If an entry names a file, that's
where the concept lives in this repo.

## Electron & process model

- **Main process** — the trusted Node.js process. Has `fs`, `crypto`, dialogs,
  and the OS keychain. All privileged work happens here (`src/main/`).
- **Renderer process** — the sandboxed UI process (Chromium + Vue). No Node, no
  `fs`, no network. Treated as untrusted (`src/renderer/`).
- **Preload** — a small script that runs in the renderer with limited bridge
  access and exposes `window.api`, the _only_ channel to main
  (`src/preload/index.js`).
- **IPC** — _Inter-Process Communication._ Named message channels the two
  processes talk over: `ipcMain.handle('channel', …)` in main,
  `ipcRenderer.invoke('channel', …)` from preload. See
  [ipc-security.md](ipc-security.md).
- **contextIsolation** — Electron setting that keeps the preload's and page's
  JavaScript worlds separate, so a page can't reach Electron internals.
- **sandbox** — OS-level process sandbox for the renderer; blocks direct system
  access even if the page is compromised.
- **contextBridge** — the Electron API the preload uses to expose a safe,
  frozen `window.api` object to the page.

## Security

- **CSP** — _Content Security Policy._ A page-level allowlist (`connect-src
'self'`, `object-src 'none'`) that blocks outbound requests and plugins — the
  second layer behind the network kill switch.
- **Kill switch** — `webRequest.onBeforeRequest` handler that cancels every
  network request that isn't `file:`/`blob:`/`data:` (`src/main/security.js`).
- **safeStorage** — Electron's OS-backed secret store (Keychain on macOS, DPAPI
  on Windows, libsecret on Linux). Encrypts keys at rest.
- **DPAPI** — _Data Protection API_, the Windows secret-encryption service
  `safeStorage` uses.
- **XXE** — _XML External Entity_ attack: a crafted XML `DOCTYPE` that reads
  local files or expands recursively ("billion laughs"). Rejected outright by
  the `.xlsx` reader.
- **ReDoS** — _Regular-expression Denial of Service_: a pattern that takes
  exponential time on crafted input. Why the diff-search regex is length- and
  complexity-limited, and one of the SheetJS CVEs we avoided.
- **Prototype pollution** — an attack that writes to `Object.prototype` via
  attacker-controlled keys (`__proto__`), poisoning every object. The `.xlsx`
  reader uses `Map`/`Object.create(null)` to prevent it.
- **Decompression bomb** — a tiny archive that inflates to something enormous.
  The `.xlsx` reader caps input, per-entry, total, and ratio.
- **Provenance allowlist** — main only reads a file path the user actually
  chose (dialog or real drop); a path the renderer invents is refused
  (`src/main/files.js`).

## Cryptography (sharing & vault)

- **AES-256-GCM** — the symmetric cipher used for saved diffs and shared files.
  _GCM_ (Galois/Counter Mode) is authenticated: tampering fails the tag.
- **AAD** — _Additional Authenticated Data._ Bytes covered by the GCM tag but
  not encrypted (e.g. an entry's metadata), so editing them voids the entry.
- **Ed25519** — the elliptic-curve signature scheme; a shared file is _signed_
  by the sender.
- **X25519** — the elliptic-curve key-agreement scheme; used for **ECDH**.
- **ECDH** — _Elliptic-Curve Diffie–Hellman_, deriving a shared secret between
  sender and recipient without transmitting a key.
- **HKDF** — _HMAC-based Key Derivation Function_, turns the ECDH secret (plus a
  random salt) into the actual AES key.
- **Sign-then-encrypt** — the sealing order: sign the payload, then encrypt, so
  the ciphertext reveals nothing and only the addressed recipient can open it
  (`src/main/sealing.js`).
- **Fingerprint** — a short hash of a public key, recomputed on import to
  identify a trusted peer.

## File formats & parsing

- **Adapter** — a small module turning a raw file into a `{ kind, … }`
  **comparable** the viewer understands (`src/renderer/src/adapters/`).
- **Comparable** — the normalized shape a viewer renders: `{ kind:'text', … }`
  or `{ kind:'spreadsheet', … }`.
- **OOXML** — _Office Open XML_, the `.xlsx`/`.docx` format: a ZIP archive of
  XML parts.
- **SAX** — _Simple API for XML_, a streaming parser that fires events per tag
  instead of building a whole DOM tree (the `saxen` library).
- **DEFLATE** — the compression algorithm inside ZIP (the `fflate` library).
- **Shared strings** — an `.xlsx` de-duplicated text table (`sharedStrings.xml`)
  that cells reference by index.
- **LCS** — _Longest Common Subsequence_, the classic diff algorithm; used to
  align spreadsheet rows and to build the copy-as-patch output.
- **Monaco** — the VS Code editor component, used for the text diff view.
- **Mermaid** — the text-to-diagram library used to render `mermaid` snippets.

## Packaging & distribution

- **NSIS** — _Nullsoft Scriptable Install System_, the Windows `.exe` installer
  electron-builder produces.
- **DMG** — the macOS disk-image install format.
- **AppImage / .deb** — the two Linux distribution formats built.
- **Notarization** — Apple's malware-scan step that clears the Gatekeeper
  warning on macOS.
- **SmartScreen** — Windows' reputation check that warns on unsigned installers.
- **Chocolatey (choco)** — a Windows package manager (a Homebrew equivalent);
  see [packaging.md](packaging.md) for release notes.

## Project conventions

- **Band / band-row** — a full-width horizontal strip that vertically centres
  its content with flexbox and shares a height with its peers, so nothing
  drifts (`styles/ui.css`).
- **Token** — a design-system variable (color, radius, type size, spacing) in
  `styles/tokens.css` / `themes.css`; hardcoded literals are rejected by
  `scripts/check-style-tokens.mjs`.
- **Vault** — the encrypted local store of saved diffs.
- **Sealing** — producing a shareable, signed-and-encrypted `.diffbro` file.
- **Comparable kind** — `text` vs `spreadsheet`; the content router picks the
  viewer from it.
- **Tips vs tour** — two different things, and the copy leans on the
  difference. **Tips** are the automatic ones: they appear on a first launch and
  after an update, and `showTips` turns them off for good. The **tour** is the
  same steps summoned deliberately (Help ▸ Show Tour, Settings, the palette); it
  ignores every flag and never switches tips back on.
- **Run** — one block of tour steps shown together. Run one is the six a first
  launch needs; run two is the four offered afterwards by the "Three more tips?"
  dialog.
- **Zone step** — a step whose target is an area rather than a control (the
  comparison pane, which takes a drop anywhere). Ringed dashed, and its callout
  sits inside it.
- **Live step** — the exception. A step's hole is cut so its target stays sharp,
  but the pointer stops at the veil unless the step says `live`: a click on a
  file slot mid-tour opens a picker over the card pointing at it. Exactly one
  step asks for the press it rings, and that is the one ringing Save.
- **Context region** — what a step is ABOUT when that is not the control it
  points at. The Share step rings a button but is about the whole comparison, so
  that is stroked and the veil softened over it — a diff blurred past reading
  cannot be the thing being sealed.
- **Point** — the one control inside a large target that the ring and the beak
  belong on. The library step cuts the whole sidebar out so the list is seen
  filtering, and points at the search box being typed into.
- **Advance command** — what a step's Next runs before moving on. The step
  points at the control, the press performs the action, and the following step
  lands inside whatever opened. Firing on ENTRY instead is what made windows
  appear out of the blue. Its twin is the **undo**, which Back runs so a step
  returned to is not looking at a control the next step's window is covering.
- **The stage** — everything the tour puts on screen for itself: the demo
  comparison in its own scratch tab, the example snippet, the search it types.
  All of it is removed when the tour ends, finished or walked out of — it was
  the tour's, never the user's library.

## Union view

The Mermaid comparison renders **one** diagram carrying both revisions rather
than two side by side. Two independent renders lay out separately, so an
inserted node moves everything below it and the reader cannot tell drift from
change; a single layout removes that question.

## Context radius

How many hops out from a change the focused diagram keeps. 0 shows only what
changed, 1 its immediate neighbours. What it hides is counted on screen, never
silently dropped.

## Hand-off

Diff Bro opening your own mail client on a pre-addressed message rather than
sending anything itself. It seals the diff, hands a `mailto:` to the OS, copies
the sealed file to the clipboard, and stops — you press Send. This is why adding
email did not cost the offline guarantee: no socket is opened by the app.

## Copy content vs Copy as file

Two different intents, deliberately two commands. **Copy content** puts
characters on the clipboard — right when you are pasting into an editor.
**Copy as file** puts a real file there, for a destination that wants one: a
mail draft, a chat window, a folder. A secret snippet offers only the first, because
the second would write its plaintext to disk.

## Staged file

The temporary copy Copy as file puts on the clipboard. A file on the clipboard is
a _path_, so the bytes must exist until the paste happens. Staged files live in a
`0o700` directory under the OS temp dir, are pruned after 30 minutes, and are
swept on quit and again on next launch.
