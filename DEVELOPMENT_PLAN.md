# DiffBro – Development Plan

Goal: cross-platform (Windows + macOS) desktop diff viewer with GitHub-style
rendering. Text files first; Word and Excel comparison later via the
adapter pattern.

Stack: Electron + electron-vite + Vue 3 + Pinia + Monaco diff editor +
electron-builder.

---

## Phase 0 – Project setup ✅ (this scaffold)

- [x] electron-vite project structure (main / preload / renderer)
- [x] Vue 3 + Pinia wired up
- [x] Monaco diff editor with worker configuration for Vite
- [x] Secure IPC: contextIsolation on, nodeIntegration off, file access in main
- [x] Adapter registry with text adapter (language detection by extension,
      falling back to content sniffing for extensionless files and pasted text
      so paste-mode diffs and files like `Dockerfile` still get syntax coloring)
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
      `editor.getLineChanges()` on `onDidUpdateDiff`; two loaded sides with no
      changes surface an explicit "No differences" state instead of a bare +0/−0
- [x] Copy diff as a git-style unified patch (toolbar / Edit menu /
      Ctrl+Shift+C): a pure line-level LCS in `utils/unifiedDiff.js` (guarded for
      size), copied via the main-process clipboard (`window.api.copyText`)
- [x] Live re-diff on focus follows the two comparison sides *and* a partial-paste
      loaded file (any slot with a real path), coalescing multiple changes into a
      single "reloaded" notice

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
- [x] End-to-end suite in `e2e/` (Playwright `_electron`, `make e2e`): drives
      the built app in an isolated `--user-data-dir`, no bundled browser / no
      network. Covers launch smoke, the Settings domain-pane rail, theme apply +
      persistence across a relaunch, the snippet copy "Copied" flash + the real
      OS-clipboard write, paste-compare diffing with Monaco stats, saving a diff
      and reopening it after a relaunch (the full vault encrypt→store→decrypt
      round-trip), the Share two-step flow into first-time key setup, and Mermaid
      rendering in both the diagram viewer and the snippet editor's live preview.
      Caught a real shipping bug — `navigator.clipboard.writeText` is denied by
      the deny-all permission handler, so all clipboard writes now go through the
      main process (`src/main/clipboard.js`, `window.api.copyText`).
- [x] Five selectable themes (Light default, Dark, Solar, Neon, Contrast) —
      registry in `utils/themes.js`, palette per theme on `:root[data-theme]`,
      Monaco/Mermaid ground keyed off `isDarkTheme`; picked in Settings →
      Appearance (swatch previews), Ctrl/Cmd+D still flips light↔dark; choice
      persisted through the durable data-dir store, so it survives a reinstall
- [x] Settings split into domain panes behind a left rail (Appearance /
      Storage / Limits) so the window stays scannable
- [x] Re-read files on window focus (quiet re-read: no large-file prompt,
      silent skip if the file vanished; toast when the diff was reloaded)
- [x] Window state persistence (size/position/maximized in
      `userData/window-state.json`, restored only onto a connected display);
      resizable with a 940×640 minimum so the sidebar and both diff panes
      stay usable
- [x] App icon: `resources/icon.png` rasterized from the logo; used as the
      win/linux window icon (`?asset` import) and picked up by
      electron-builder (`buildResources: resources`) for installer icons

## Phase 2.5 – Snippets & Mermaid diagrams ✅

- [x] Encrypted, tagged snippet library ("quiet shelves" sidebar: ★ Favorites +
      All snippets, newest-first, collapsible tag filter that composes with
      search, hover preview that decrypts on demand; copy-to-clipboard shows a
      transient "Copied" flash at the row via unit-tested `useCopyFeedback`)
- [x] Mermaid diagram rendering for `mermaid` snippets — lazy-loaded (dynamic
      `import`, its own build chunks; nothing added to the main bundle), runs
      **offline under the strict CSP with no `unsafe-eval`** (verified against
      every diagram type in real Chromium before adopting the dep). SVG is
      inserted via `DOMParser` + `replaceChildren`, never `innerHTML`/`v-html`;
      `securityLevel: 'strict'` (DOMPurify) is never lowered.
- [x] Live preview in the snippet editor + a zoom/pan diagram viewer, drag-resizable
      from any of its four corners (`useResizable` + pure `utils/resizeRect.js`) and
      auto-maximised when the app window enters fullscreen (main pushes
      `window:fullscreen`, `useFullScreen` relays it); diagram theme paired to the
      app theme (dark → `dark`, light → `default`), re-rendered on theme switch so
      text never blends into the canvas
- [x] Auto-detect for the snippet editor's syntax picker
      (`utils/detectLanguage.js`): distinctive, low-ambiguity signals for every
      offered language (JSON, Mermaid, SQL, Markdown, YAML/K8s, Python, shell,
      PHP, JS, TS, XML, HTML, CSS, Dockerfile, Go, Rust, Java), ordered
      most-distinctive-first with anti-false-positive guards (a fenced block is
      Markdown not its inner code; TS before JS; HTML-only tags before generic
      XML; code braces disqualify CSS/YAML). Best-effort — a miss lands on
      plaintext rather than mis-coloring. Covered by a positive-plus-negative
      test matrix in `tests/renderer/utils/detectLanguage.test.js`.

## Phase 2.6 – UI/UX refinements ✅

- [x] Plaintext `settings.json` store (`stores/settingsStore.js`): reorderable
      sidebar sections, drag-reorderable saved-diff categories, shortcut-bar
      visibility, and user-raisable comparison-file / snippet size limits with
      safe defaults and hard ceilings (main enforces the file limit from it)
- [x] Reorderable sidebar sections behind a shared `SectionHeader`; Saved /
      External / Snippets each extracted into a self-contained component. Reorder
      by dragging a whole header (`useSectionReorder`) or via its up/down
      steppers; a single toolbar padlock freezes the arrangement
      (`settings.sectionsLocked`, persisted — locked headers drop the drag handle
      and steppers)
- [x] Diff search gains match-case, whole-word, and safety-limited regex
      (`utils/searchRegex.js` refuses over-long / catastrophic patterns)
- [x] Partial paste mode: diff pasted text against a dropped/chosen file
- [x] Unsaved-work guards: replacing an active comparison (drop new files, or
      open one into a loaded slot) confirms first, unless it's already saved
      (`diffStore.diffSaved`); the snippet editor confirms before Cancel/×
      discards a dirty draft (`useSnippetDraft` — unit + e2e tested)
- [x] Tools menu grouped per format (Base64 / JSON / XML / SQL / Find & Replace /
      Text Encryption), mirrored as an always-visible launcher pinned to the
      sidebar foot; Help → Keyboard Shortcuts lists bindings for the host OS
- [x] Help → Report an Issue confirms before leaving the offline sandbox, then
      hands the fixed repo issue URL to the OS browser (the only outward link;
      the URL is fixed in main, the renderer can only trigger it)
- [x] One tag namespace shared across saved diffs and snippets (replacing
      categories); tags ride inside a shared diff's signed+encrypted payload,
      but the local-only "imported" tag is stripped on send and re-applied (and
      sender tags re-sanitized) on import
- [x] Color palette split into `styles/themes.css` (structure stays in
      `tokens.css`), plus app-wide `.section-actions` spacing so no section's
      buttons drift out of alignment
- [x] Mermaid "Expand" opens a full-window viewer above all dialogs (the
      snippet editor closes first)

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

## Phase 5 – Excel spreadsheets (~5–7 days)

A **structured grid diff** (not text extraction): sheet tabs, aligned grids,
cell/row/column-level highlighting. `.xlsx` only (zip-of-XML); legacy `.xls`
(BIFF) is out of scope.

- [x] **Parser spike (Phase 0):** custom, minimal, read-only OOXML reader in the
      **main process** on `fflate` (zip) + `saxen` (streaming SAX) — chosen over
      SheetJS (npm frozen at 0.18.5 with unpatched CVE-2023-30533 +
      CVE-2024-22363; fixes CDN-only) and exceljs (21 MB, write surface). Lives
      in `src/main/xlsx/`, fully unit-tested (`tests/main/xlsx/`, 16 cases incl.
      bomb / DOCTYPE / cell-budget / proto-pollution). Security by *not parsing*:
      only `workbook.xml`, its rels, `sharedStrings.xml`, and `worksheets/sheetN.xml`
      are inflated; formulas (`<f>`) are never read or evaluated; external links,
      VBA, drawings, media, styles are never touched. Caps: decompression-bomb
      (input/entry/total/ratio), per-sheet cell budget; `DOCTYPE` rejected (XXE).
- [x] `file:read` detects `.xlsx` (extension + `PK` zip magic) before the binary
      sniff and parses it in main, returning `{ kind:'spreadsheet', sheets }` or a
      polite `{ error:'xlsx' }` (`src/main/files.js`). Shares the binary read path
      with the Word/`docx` phase.
- [x] `xlsxAdapter` returning `{ kind: 'spreadsheet', sheets }`; registered ahead
      of textAdapter (`adapters/xlsxAdapter.js`).
- [x] **Router in the content area:** `App.vue` picks the viewer by
      `store.comparableKind` (`DiffViewer` for text, `SpreadsheetDiffViewer` for
      spreadsheets).
- [x] `SpreadsheetDiffViewer.vue` (+ `SheetTabBar`, `SpreadsheetGrid`): sheet tabs
      with per-sheet change counts, two aligned grids sharing one scroll region,
      changed-cell / added-row / removed-row highlighting, and a status strip.
- [x] Row-alignment algorithm (`utils/alignRows.js`, unit-tested): LCS over row
      signatures with key-column pairing so an inserted/deleted row doesn't
      cascade; O(n·m) LCS under a 4M-product budget, else O(n) positional.
- [x] Hang protection: the grid caps rendered rows at `RENDER_ROW_CAP` (3000) with
      a "first N rows shown" note — no virtualization yet. Text already has its
      guards (10 MB file-size prompt on load + `MAX_DIFF_LINES` on the patch).
      Stress benchmark: `tests/stress/diff-stress.test.js` (opt-in, `STRESS=1`).
      Measured on this machine: parse+align stays smooth to 10k rows (~99 ms),
      "ok" to 50k (~0.5 s), sluggish at 100k / 5.5 MB (~1 s); the DOM render is the
      real viewing ceiling (Docker-measured).
- [ ] Note limitation in UI: value diff, not formatting; dates read as serials
      (styles deliberately not parsed).
- [ ] Follow-up: true row virtualization for the grid (replace `RENDER_ROW_CAP`);
      swap the synchronous unzip for `fflate` streaming `Unzip` with a hard
      byte-abort so the bomb bound is enforced *during* inflation.
- [ ] E2E (`e2e/spreadsheet.spec.mjs`) written — verify under `make e2e` (Docker),
      it can't launch Electron on the host.

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
- **No CDN assets**: Monaco (and mammoth for docx, fflate + saxen for xlsx) are
  bundled from npm at build time. `npm install` needs network on the *dev*
  machine only; the packaged app does not.
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

