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
  access and exposes `window.api`, the *only* channel to main
  (`src/preload/index.js`).
- **IPC** — *Inter-Process Communication.* Named message channels the two
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

- **CSP** — *Content Security Policy.* A page-level allowlist (`connect-src
  'self'`, `object-src 'none'`) that blocks outbound requests and plugins — the
  second layer behind the network kill switch.
- **Kill switch** — `webRequest.onBeforeRequest` handler that cancels every
  network request that isn't `file:`/`blob:`/`data:` (`src/main/security.js`).
- **safeStorage** — Electron's OS-backed secret store (Keychain on macOS, DPAPI
  on Windows, libsecret on Linux). Encrypts keys at rest.
- **DPAPI** — *Data Protection API*, the Windows secret-encryption service
  `safeStorage` uses.
- **XXE** — *XML External Entity* attack: a crafted XML `DOCTYPE` that reads
  local files or expands recursively ("billion laughs"). Rejected outright by
  the `.xlsx` reader.
- **ReDoS** — *Regular-expression Denial of Service*: a pattern that takes
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
  *GCM* (Galois/Counter Mode) is authenticated: tampering fails the tag.
- **AAD** — *Additional Authenticated Data.* Bytes covered by the GCM tag but
  not encrypted (e.g. an entry's metadata), so editing them voids the entry.
- **Ed25519** — the elliptic-curve signature scheme; a shared file is *signed*
  by the sender.
- **X25519** — the elliptic-curve key-agreement scheme; used for **ECDH**.
- **ECDH** — *Elliptic-Curve Diffie–Hellman*, deriving a shared secret between
  sender and recipient without transmitting a key.
- **HKDF** — *HMAC-based Key Derivation Function*, turns the ECDH secret (plus a
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
- **OOXML** — *Office Open XML*, the `.xlsx`/`.docx` format: a ZIP archive of
  XML parts.
- **SAX** — *Simple API for XML*, a streaming parser that fires events per tag
  instead of building a whole DOM tree (the `saxen` library).
- **DEFLATE** — the compression algorithm inside ZIP (the `fflate` library).
- **Shared strings** — an `.xlsx` de-duplicated text table (`sharedStrings.xml`)
  that cells reference by index.
- **LCS** — *Longest Common Subsequence*, the classic diff algorithm; used to
  align spreadsheet rows and to build the copy-as-patch output.
- **Monaco** — the VS Code editor component, used for the text diff view.
- **Mermaid** — the text-to-diagram library used to render `mermaid` snippets.

## Packaging & distribution

- **NSIS** — *Nullsoft Scriptable Install System*, the Windows `.exe` installer
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
