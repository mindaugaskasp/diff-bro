<p align="center">
  <img src="resources/logo.svg" width="140" alt="Diff Bro — chill about diffs, serious about security">
</p>

# Diff Bro

**An offline-only desktop diff viewer for Windows and macOS.** GitHub-style
side-by-side comparison, syntax highlighting, and encrypted local history — with
a hard promise: it never touches the network.

<p align="center">
  <img src="docs/screenshots/diff-dark.png" width="820" alt="Diff Bro comparing two JSON files side by side — word-level highlights and add/remove counts, with a sidebar of saved diffs, shared diffs, snippets, and colored tags">
</p>

## Why Diff Bro

- **Truly offline.** No account, no telemetry, no auto-update, no CDN. The app
  makes _zero_ network requests — enforced by a session-level kill switch, a
  strict CSP, and a sandboxed renderer, not just a promise. Your files never
  leave your machine.
- **Private by default.** Anything you keep — saved diffs, snippets, keys — is
  encrypted on-device (AES-256-GCM), with the key held by your OS keychain.
  Saved diffs auto-expire.
- **Fast and familiar.** The Monaco editor that powers VS Code, with GitHub-style
  rendering you already know.

## Features

- **Diff** two files or pasted text — split or inline, word-level highlights,
  syntax highlighting, in-view search, and a live re-diff when a file changes on
  disk. Copy the result as a git-style unified patch.
- **Excel (.xlsx) comparison** — a structured **grid** diff with sheet tabs and
  cell / row-level highlighting, aligned so an inserted row doesn't cascade.
  Parsed entirely offline by a small custom reader (no heavyweight dependency).
- **Paste mode** for quick throwaway comparisons, including pasted text against a
  real file — or just hit **Ctrl/Cmd+V** to paste straight into a comparison.
- **Drag & drop** files onto the window; it warns before discarding unsaved work.
- **Saved diffs** — encrypted, optionally auto-expiring, and tagged (retag any of
  them later from the row's tag button).
- **Share** a diff as a sealed, signed file only its intended recipient can open.
- **Export a saved diff as an image** — a high-resolution screenshot of the diff
  view itself, so it carries your theme, the split panes and the syntax
  highlighting rather than a redrawn approximation. Cropped to the change, and a
  diff taller than the window is scrolled and stitched so the whole comparison
  lands in one picture — up to a height you set in Settings → Limits, measured
  on screen so it captures the same amount whatever your display's scaling.
  Select lines in either pane first to capture just those. Copied straight to
  the clipboard or saved as a PNG. Taken and kept on-device.
- **Secret snippets** — mark a snippet secret and its contents never render:
  the editor, the hover card and the launcher all show `****` with a notice,
  while copying still puts the real value on the clipboard. Masking is on top of
  the encryption every snippet already has, not instead of it.
- **Snippets** — an encrypted, tagged text library with per-language
  highlighting and live **Mermaid** diagram rendering, in a viewer you can drag
  bigger from any corner (and that fills the window when the app goes fullscreen).
  The **Markdown** and **Jira / Confluence** syntaxes each add a formatting
  toolbar (bold, headings, lists, quote, code, links) and a live rendered
  preview, with a Rendered/Plain toggle.
- **Quick look-up** — a global shortcut summons a floating search over your
  snippets and saved diffs _without raising the app_; ↑/↓ to browse, **→** to
  step into a preview or the tools, **←** to step back out (and to close it once
  there is nothing left to leave), **Enter** to open, **Ctrl/Cmd+C** to copy a
  snippet straight to the clipboard. **+** captures a quick plaintext snippet
  without raising the app. Rebind the shortcut in Settings.
- **Uniform snippet names** — every name is sentence-cased as it is saved, so a
  library grown over months still reads consistently.
- **Resizable dialogs** — the snippet editor and the tool windows resize from any
  edge or corner and remember their size between sessions (or a one-click setting
  maximizes them all). Existing snippets open read-only until you press Edit.
- **Tools** — rich panels, not blank text boxes: **JSON** (pretty / minify /
  sort keys, a JSONPath filter, and a syntax-coloured collapsible tree),
  **Base64** (live encode/decode, URL-safe, MIME wrap, byte counts), **UUID**
  (generate v1/v4/v5/v6/v7, inspect, and reverse-convert), **JWT** (decode and
  inspect claims), **Epoch** (date ⇄ timestamp with a picker), **URL** (encode /
  decode with an editable query-param table), **Lines** (split, sort, dedupe,
  and build lists — e.g. a CSV row into a quoted SQL `IN (…)` list), plus **XML**
  format + validate, find & replace, and passphrase text encryption
  (AES-256-GCM) with an opt-in raw-key AES-256-CBC decrypt for external
  payloads. Your recent tools sit on the sidebar shelf; the rest are one search
  away.
- **Terminal command** — install `diffbro` from Settings ▸ Terminal, then
  `diffbro compare a.json b.json` opens a comparison in the running app,
  `diffbro create snippet` opens a new snippet, and `diffbro cb save` keeps what
  you just copied. A second launch hands its arguments to the running window
  through Electron's single-instance lock — nothing listens on a port.
- **Yours to arrange** — fourteen themes (incl. Nord, Sepia, Solar, a playful
  Nyan with a reward cat, a Matrix digital-rain theme, and accessibility-grade
  Contrast and Beacon), one tag namespace shared across diffs and snippets, a
  sidebar that filters by section and tag, and adjustable limits, all remembered
  between sessions.

<p align="center">
  <img src="docs/screenshots/spreadsheet-diff.png" width="820" alt="Two multi-sheet Excel workbooks compared as aligned grids: sheet tabs with per-sheet change counts, changed cells boxed, and an added row shown as a striped gap on the side without it">
  <br><em>Excel (.xlsx) workbooks compared as aligned grids — sheet tabs, changed cells boxed, added/removed rows aligned.</em>
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/diff-light.png" alt="The same JSON diff in the light theme — floating cards on a tinted ground">
      <p align="center"><em>Light and dark themes, GitHub-style rendering.</em></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/save-encrypted.png" alt="Save dialog: name, tags, a Secure auto-expiring toggle, and an expiry of at most 24 hours">
      <p align="center"><em>Saved diffs are encrypted on-device and auto-expire.</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/empty-state.png" alt="The start screen listing supported file types (Excel, JSON, XML, YAML, CSV, Markdown, and any text or code file) beside a sidebar of saved diffs, shared diffs, snippets, and tags">
      <p align="center"><em>Drop or choose two files — Excel, JSON/XML, or any text.</em></p>
    </td>
    <td width="50%" valign="top"></td>
  </tr>
</table>

## Download

Grab the latest installer from the
[**latest release**](https://github.com/mindaugaskasp/diff-bro/releases/latest):

| OS                             | Download                        |
| ------------------------------ | ------------------------------- |
| **Windows** (10/11)            | `diff-bro-Setup-v<version>.exe` |
| **macOS** (Apple silicon, 12+) | `diff-bro-v<version>.dmg`       |

**macOS via Homebrew:**

```bash
brew tap mindaugaskasp/tap
brew install --cask diff-bro
xattr -dr com.apple.quarantine "/Applications/Diff Bro.app"
```

Builds are currently **unsigned**, so Windows SmartScreen and macOS Gatekeeper
will warn on first launch (the `xattr` line above clears it on macOS). Full
details in [docs/packaging.md](docs/packaging.md).

## Tech

Electron · Vue 3 · Pinia · Monaco. Text first, with an adapter registry for
richer formats to come. Security and offline guarantees are non-negotiable — see
the [security model](docs/security.md).

## Build from source

Needs **Node 22.12+** (the version Docker and CI use — `nvm use` picks it up
from `.nvmrc`). Older majors install but warn, and the build toolchain no
longer supports them.

```bash
nvm use          # or install Node 22.12+ yourself
npm install
npm run dev      # run locally
npm run check    # lint + tests
```

No local Node? The same flow runs in Docker: `make dev`, `make check`,
`make e2e`. See [docker/README.md](docker/README.md) and `make help`.

## Docs

- [Architecture](docs/architecture.md) — processes, trust boundary, directory map.
- [IPC & security](docs/ipc-security.md) — how renderer↔main talk, and what the
  sandbox blocks (with diagrams).
- [Security model](docs/security.md) — offline guarantee, sharing, keys, backup.
- [Packaging & releasing](docs/packaging.md) — installers, signing notes, CI.
- [Chocolatey release](docs/chocolatey.md) — plan + package skeleton for
  `choco install diffbro`.
- [Glossary](docs/glossary.md) — every term and abbreviation (IPC, CSP, GCM, …).
- Coding standards live in [CLAUDE.md](CLAUDE.md).
