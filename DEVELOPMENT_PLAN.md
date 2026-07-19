# DiffBro – Development Plan

Goal: cross-platform (Windows + macOS) desktop diff viewer with GitHub-style
rendering. Text files first; Word, PDF, and image comparison later via the
adapter pattern.

Stack: Electron + electron-vite + Vue 3 + Pinia + Monaco diff editor +
electron-builder.

---

## Phase 0 – Project setup ✅ (this scaffold)

- [x] electron-vite project structure (main / preload / renderer)
- [x] Vue 3 + Pinia wired up
- [x] Monaco diff editor with worker configuration for Vite
- [x] Secure IPC: contextIsolation on, nodeIntegration off, file access in main
- [x] Adapter registry with text adapter (language detection by extension)
- [x] electron-builder config (NSIS for Windows, DMG for macOS)

First run: `npm install && npm run dev`

## Phase 0.5 – Docker test environment ✅

- [x] Run the full Electron app in a Linux container under Xvfb, streamed to
      the browser via x11vnc + noVNC — test without building any installer:
      `npm run docker:up` → http://localhost:6080/vnc.html
- [x] Source bind-mounted with HMR; `node_modules`/`build` kept in
      container-local volumes so Linux and host binaries never mix
- [x] `DIFFBRO_DOCKER=1` switches main process to `--no-sandbox` +
      software rendering (container-only, never on desktop)
- [x] `tests/data/` samples mounted for in-container diffing
      (see `docker/README.md` for details and limitations)

## Phase 1 – Text diff MVP (~2–3 days)

- [x] Verify file pickers, drag & drop, split/unified toggle, ignore-whitespace
      (verified in the Docker env: pickers, split/unified, ignore-whitespace,
      keyboard accelerators; drag & drop code path unit-exercised but needs a
      quick native-desktop sanity check — noVNC can't synthesize OS drags)
- [x] Handle edge cases: binary files (NUL-byte sniff in main process, polite
      toast in renderer), huge files (>10 MB → confirm dialog before loading),
      non-UTF-8 encodings (`chardet` detection + `iconv-lite` decode in main)
- [x] "Paste text" mode (two textareas) for quick Diffchecker-style comparisons
      without saving files (toolbar button or Ctrl+T)
- [x] App menu: Open Left (Ctrl+1) / Open Right (Ctrl+2) / Swap (Ctrl+Shift+S)
      / Clear (Ctrl+K) / Paste mode (Ctrl+T) / Toggle split (Ctrl+\)
- [x] Diff stats in toolbar (n additions, m deletions) via
      `editor.getLineChanges()` on `onDidUpdateDiff`

## Phase 2 – Polish (~2–3 days)

- [x] Shortcut hint bar: slim dismissible strip at the top listing the common
      keyboard shortcuts (dismissal remembered in localStorage)
- [x] Saved diffs sidebar (replaces the "recent comparisons" idea): save the
      current comparison via Ctrl+S / toolbar button. Entries are stored in
      localStorage **AES-256-GCM encrypted**; the key is generated per install
      in the main process and protected by the OS keychain (`safeStorage` —
      DPAPI/Keychain/libsecret). Auto-expiry is mandatory: default 1 h,
      maximum 24 h; a live per-second countdown is shown next to each entry
      and expired entries are purged the moment they lapse.
      Only the entry name and timestamps are plaintext. Works for loaded
      files and for text typed/pasted in paste mode alike.
- [x] Shared diffs: export a saved diff as a **sealed** `.diffbro` file —
      sign-then-encrypt. Payload (with absolute timestamps) is signed with
      the sender's Ed25519 key, then encrypted with AES-256-GCM under a key
      derived (HKDF, random salt) from ECDH between a **fresh ephemeral
      X25519 key per file** and the **selected recipient's** X25519 key.
      So: the file is unreadable to everyone but the addressed recipient,
      every file+recipient combination uses a different key, and any
      modification (including extending `expiresAt`) fails the GCM tag
      and/or signature. Peers exchange `.diffbrokey` files (public halves
      only, fingerprint recomputed on import) in both directions via
      File → Export My Public Key / Add Trusted Key. Receiver additionally
      rejects unknown signers, expired payloads, and TTLs over 24 h, so a
      shared diff expires at the same moment on every machine. Imported
      diffs are listed in their own "Imported diffs" sidebar section with
      the sender's label. Private keys live behind `safeStorage`.
- [x] One-click sharing UX: Share button / Ctrl+E saves the current diff
      (name + expiry) and flows straight into the recipient picker. Keys are
      generated automatically on first use; with no trusted recipients yet
      the dialog becomes a two-step wizard (save my key → add their key)
      so a fresh install can share in under a minute.
- [x] Custom themed menu bar (File/View) on Windows/Linux replacing the
      dated native strip; the hidden application menu keeps all
      accelerators working. macOS keeps the native system menu bar.
- [x] Logo (`resources/logo.svg`): chill bro (backwards cap + sunglasses
      with +/− diff lenses) plus shield-check — calm and secure.
      (.ico/.icns for installers are auto-generated by electron-builder
      from `resources/icon.png`.)
- [x] Security hardening pass: renderer `sandbox: true`; deny-all
      `setPermissionRequestHandler`; share signature bound to the recipient
      (payload ‖ recipient-fp) and GCM AAD over format ‖ recipient-fp;
      export-side TTL validation; size caps on imported share/key files;
      vault entries authenticate their plaintext metadata (id/timestamps/
      sender as AES-GCM AAD, so editing localStorage `expiresAt` voids the
      entry); Electron upgraded past the 33.x advisory batch. Vault crypto
      moved entirely into the main process (`vault:encrypt`/`vault:decrypt`
      IPC) — the vault key never enters the renderer, so a renderer
      compromise cannot exfiltrate it.
- [x] Tests + coding standards: pure crypto extracted into unit-testable
      modules (`src/main/sealing.js`, `src/main/vaultCrypt.js` — share.js
      and index.js are thin Electron glue); Vitest suite in `tests/`
      (44 tests: sealing roundtrip/tamper/binding/TTL, vault AAD, stores,
      adapters); ESLint flat config with security rules (renderer banned
      from Node/Electron imports, no v-html/eval) + Prettier;
      `npm run check` = lint + tests; CLAUDE.md encodes the guidelines.
- [x] Light/dark theme toggle (Monaco `vs` / `vs-dark` + CSS variables on
      `:root[data-theme]`; toolbar button + View menu + Ctrl/Cmd+D; choice
      persisted in localStorage)
- [x] Re-read files on window focus (quiet re-read: no large-file prompt,
      silent skip if the file vanished; toast when the diff was reloaded)
- [x] Window state persistence (size/position/maximized in
      `userData/window-state.json`, restored only onto a connected display);
      resizable with a 940×640 minimum so the sidebar and both diff panes
      stay usable
- [x] App icon: `resources/icon.png` rasterized from the logo; used as the
      win/linux window icon (`?asset` import) and picked up by
      electron-builder (`buildResources: resources`) for installer icons

## Phase 3 – Packaging & distribution (~1–2 days + cert wait times)

- [ ] Windows: NSIS installer via `npm run build:win`. Unsigned builds trigger
      SmartScreen; a code-signing cert (OV ~€70–200/yr, or Azure Trusted
      Signing ~$10/mo) removes the warning. Optional for personal use.
- [ ] macOS: DMG build **must run on a Mac** (or macOS CI runner — GitHub
      Actions has free macOS runners for public repos). Notarization requires
      an Apple Developer account ($99/yr); unnotarized apps need right-click →
      Open on first launch.
- [x] GitHub Actions workflow: build both platforms on tag push, attach
      installers to a GitHub Release (`.github/workflows/release.yml`,
      triggered on `v*.*.*` tags)
- [x] Makefile command to package Apple / Windows / Linux installers
      (`make package-win`, `make package-linux` — both via the amd64 `builder`
      compose service, since electron-builder's `makensis` is x86_64-only and
      NSIS shells out to wine; `make package-mac` runs on the host because a
      DMG needs `hdiutil`)
- [x] Linux target: AppImage + `.deb` (`npm run build:linux`); `.deb` needs
      `deb.maintainer` because dpkg requires a "Name &lt;email&gt;" field
- [x] Themed DMG backdrop rendered from `resources/dmg-background.svg` to
      `background.png`/`background@2x.png`, with the drop-well coordinates
      mirrored in `electron-builder.yml`'s `dmg.contents`
- Auto-update: **deliberately excluded.** The app is offline-only; updates
      are installed manually from downloaded installers.

## Phase 4 – Word documents (~2 days)

- [ ] `docxAdapter`: extract text with `mammoth` in the **main process**
      (returns `{ kind: 'text', text }` → existing viewer works unchanged)
- [ ] Extend `file:read` IPC to return a Buffer for binary formats
- [ ] Note limitation in UI: content diff, not formatting diff

## Phase 5 – PDF (~3–4 days)

- [ ] `pdfAdapter`: extract text with `pdfjs-dist` (renderer-side is fine)
- [ ] Normalize extraction artifacts: hyphenation, line-order in multi-column
      layouts, page markers
- [ ] Out of scope initially: scanned PDFs (would need tesseract.js OCR) and
      visual/pixel diff of rendered pages — decide later if needed

## Phase 6 – Images (~2 days)

- [ ] `imageAdapter` returning `{ kind: 'image', dataUrl }` — first non-text
      comparable kind
- [ ] New `ImageDiffViewer.vue`: side-by-side, overlay slider, and pixel-diff
      mode via `pixelmatch` (render highlighted-difference canvas)
- [ ] Router in the content area: pick viewer component by comparable `kind`

---

## Key technical decisions already made

| Decision | Choice | Why |
|---|---|---|
| Diff engine + rendering | Monaco diff editor | GitHub-style split/inline, word-level highlights, syntax highlighting — all built in |
| File access | Main process only, via IPC | Security: renderer stays sandboxed |
| Drag & drop paths | `webUtils.getPathForFile` in preload | `File.path` was removed in Electron 32 |
| Extensibility | Adapter registry → `{ kind, ... }` comparable | New formats never touch existing viewers |
| State | Pinia | Files, options, later recent-list |

## Offline guarantee (hard requirement)

The app must never transmit files or any data over the network. Files stay on
the machine where the app runs. Measures already implemented in the scaffold:

- **Session-level network kill switch** in the main process:
  `webRequest.onBeforeRequest` cancels every request that is not `file://`,
  `devtools://`, `blob:` or `data:` (dev mode additionally allows the local
  Vite server for hot reload). Applies to fetch/XHR, images, scripts, workers
  — everything Chromium would send.
- **CSP** in the renderer: `connect-src 'self'`, `object-src 'none'` — second
  layer against accidental outbound requests from dependencies.
- **Spellcheck disabled** (Chromium otherwise downloads dictionaries from
  Google).
- **External navigation blocked**: `setWindowOpenHandler` denies all popups;
  `will-navigate` is restricted to the app itself.
- **No CDN assets**: Monaco (and later mammoth/pdfjs/pixelmatch) are bundled
  from npm at build time. `npm install` needs network on the *dev* machine
  only; the packaged app does not.
- **No telemetry, no crash reporting, no auto-update** — none included, keep
  it that way. When adding any dependency, check it makes no network calls.

Verification checklist before each release:

- [ ] Run the packaged app under Wireshark / Process Monitor while diffing
      files — expect zero outbound traffic from the app process
- [ ] Grep the codebase for `http`, `fetch(`, `XMLHttpRequest`, `WebSocket`
      outside the dev-server allowance
- [ ] Review `package.json` diff for new deps and their network behavior

## Risks / watch-outs

- **Monaco bundle size**: fine for desktop; if startup feels slow, lazy-load
  the editor chunk.
- **Very large files**: Monaco handles a few MB well; beyond that, consider
  a jsdiff + virtual-scroll fallback view.
- **macOS builds require macOS**: plan on GitHub Actions early if you don't
  have a Mac available.
