<p align="center">
  <img src="resources/logo.svg" width="140" alt="Diff Bro — chill about diffs, serious about security">
</p>

# Diff Bro

An **offline-only** desktop diff viewer / sharing app for Windows and macOS — GitHub-style
rendering, serious about privacy. Electron + Vue 3 + Pinia + Monaco.

It never makes a network request: files stay on your machine, enforced by a
session-level kill-switch, a strict CSP, and a sandboxed renderer. See
[docs/security.md](docs/security.md).

<p align="center">
  <img src="docs/screenshots/diff-dark.png" width="820" alt="Diff Bro comparing two JSON files side by side, with word-level highlights and add/remove counts">
</p>

## Download

Grab the latest installer for your OS from the
[**latest release**](https://github.com/mindaugaskasp/diff-bro/releases/latest)
— no account, no telemetry, no auto-update:

| OS | Download |
| --- | --- |
| **Windows** (10/11) | `diff-bro-Setup-v<version>.exe` |
| **macOS** (Apple silicon, 12+) | `diff-bro-v<version>.dmg` |

Installer filenames carry the version, so a download stays identifiable once
it's off the release page.

**macOS via Homebrew** (updates with `brew upgrade`):

```bash
brew tap mindaugaskasp/tap
brew install --cask diff-bro
xattr -dr com.apple.quarantine "/Applications/Diff Bro.app"
```

The third line clears the Gatekeeper quarantine described below (the build
isn't notarized yet); Homebrew 6 removed the `--no-quarantine` flag that used
to skip it. The cask is refreshed automatically on every release.

Builds are **unsigned** for now (no Apple/Microsoft cert yet):

- **Windows** — SmartScreen warns; click **More info → Run anyway**.
- **macOS** — Gatekeeper says *"Diff Bro is damaged and can't be opened."* It
  isn't damaged — that's just how recent macOS reports an unsigned,
  un-notarized app that was quarantined on download. Drag it to **Applications**,
  then run once in Terminal:

  ```bash
  xattr -dr com.apple.quarantine "/Applications/Diff Bro.app"
  ```

  and open it normally. More detail in [docs/packaging.md](docs/packaging.md).

## Features

- **Diff** two files or pasted text — split/inline, word-level highlights,
  syntax highlighting, live re-diff when a file changes on disk, and an in-view
  search with match-case, whole-word, and safety-limited regex, match count and
  jump-to-match.
- **Paste mode** compares two pasted snippets, or mixes the two — paste one
  side and drop/choose a real file on the other (partial paste).
- **Drag & drop** files onto the window (two at once builds the diff; a third
  starts over). Fixed, single window; light/dark themes; clamped zoom.
- **Saved diffs** — AES-256-GCM encrypted at rest, auto-expiring (≤ 24 h),
  organized into drag-reorderable categories, favoritable. Categories are a
  local organizing tool and never travel with a shared diff.
- **Rearrangeable sidebar** — reorder the Saved / External / Snippets sections
  to taste; the order (and other preferences) persist in a plaintext
  `settings.json`.
- **Share** a saved diff as a sealed, signed `.diffbro` file for one recipient;
  manage named trusted keys under the **Security** menu.
- **Snippets** — an encrypted, tagged, non-expiring text library with
  per-snippet syntax (JSON / SQL / Markdown / YAML / Python / Bash / PHP / …),
  filter + copy, and passphrase-protected export/import. **Mermaid** snippets
  render to a diagram — a live preview while editing plus a resizable
  zoom/pan viewer, themed to match the app, all offline.
- **Tools** — grouped by format (Base64, and JSON / XML / SQL format+validate,
  Monaco-highlighted, with "Add to Snippets"), plus a passphrase text
  Encrypt/Decrypt. **Help → Keyboard Shortcuts** lists every binding for your OS.
- **Settings** — plaintext `settings.json` (data folder, shortcut-bar
  visibility, and user-raisable comparison-file / snippet size limits with safe
  defaults).
- **Config backup/restore** — one passphrase-encrypted file for your keys,
  trusted hosts, snippets and settings (not diffs).

JSON/XML content shows an inline "pretty-print it?" banner before you diff.

## Screenshots

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/diff-light.png" alt="The same diff in the light theme">
      <p align="center"><em>Light and dark themes, GitHub-style rendering.</em></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/save-encrypted.png" alt="Save dialog: name, category, and an expiry of at most 24 hours">
      <p align="center"><em>Saved diffs are encrypted on-device and auto-expire.</em></p>
    </td>
  </tr>
</table>

## Quick start

```bash
npm install
npm run dev
npm run check   # ESLint + Vitest — run before every change lands
```

No local Node? The same flow runs in Docker: `make dev` (app via noVNC at
<http://localhost:6080/vnc.html>) and `make check`. See
[docker/README.md](docker/README.md) and `make help`.

## Docs

- [Architecture](docs/architecture.md) — processes, trust boundary, directory map.
- [Security model](docs/security.md) — offline guarantee, sharing, keys, backup.
- [Packaging & releasing](docs/packaging.md) — installers, signing notes, CI.
- Coding standards and hard rules live in [CLAUDE.md](CLAUDE.md); roadmap in
  [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).
