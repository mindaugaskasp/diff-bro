<p align="center">
  <img src="resources/logo.svg" width="140" alt="Diff Bro — chill about diffs, serious about security">
</p>

# Diff Bro

An **offline-only** desktop diff viewer for Windows and macOS — GitHub-style
rendering, serious about privacy. Electron + Vue 3 + Pinia + Monaco.

It never makes a network request: files stay on your machine, enforced by a
session-level kill-switch, a strict CSP, and a sandboxed renderer. See
[docs/security.md](docs/security.md).

## Features

- **Diff** two files or pasted text — split/inline, word-level highlights,
  syntax highlighting, live re-diff when a file changes on disk, and an in-view
  search (plain / regex, match count, jump-to-match).
- **Drag & drop** files onto the window (two at once builds the diff; a third
  starts over). Fixed, single window; light/dark themes; clamped zoom.
- **Saved diffs** — AES-256-GCM encrypted at rest, auto-expiring (≤ 24 h),
  organized into categories, favoritable.
- **Share** a saved diff as a sealed, signed `.diffbro` file for one recipient;
  manage named trusted keys under the **Security** menu.
- **Snippets** — an encrypted, categorized, non-expiring text library with
  per-snippet syntax (JSON / SQL / Markdown / YAML / Python / Bash / PHP / …),
  filter + copy, and passphrase-protected export/import.
- **Tools** — Base64, and JSON / XML / SQL format+validate (Monaco-highlighted,
  with "Add to Snippets"), plus a passphrase text Encrypt/Decrypt.
- **Config backup/restore** — one passphrase-encrypted file for your keys,
  trusted hosts, snippets and settings (not diffs).

JSON/XML content shows an inline "pretty-print it?" banner before you diff.

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
