<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/hero-dark.svg">
    <img src="docs/brand/hero-light.svg" width="900"
         alt="Diff Bro — an offline-only diff viewer for Windows, macOS and Linux">
  </picture>
</p>

<p align="center">
  <b>Stop pasting production configs into an online diff tool.</b><br>
  Compare two files, keep the ones worth keeping, and hand one to a teammate
  sealed —<br>with no account, no telemetry and not one network request.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-it-does">What it does</a> ·
  <a href="#offline-by-construction">Offline by construction</a> ·
  <a href="#build-from-source">Build</a> ·
  <a href="#docs">Docs</a>
</p>

<p align="center">
  <img src="docs/screenshots/diff-dark.png" width="880"
       alt="Diff Bro comparing two files side by side — word-level highlights and add/remove counts, with a sidebar of saved diffs, shared diffs, snippets, tools, and colored tags">
</p>

## Install

| OS                            | Get it                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **Windows** 10/11             | [`diff-bro-Setup-v<version>.exe`](https://github.com/mindaugaskasp/diff-bro/releases/latest)       |
| **macOS** 12+ (Apple silicon) | [`diff-bro-v<version>.dmg`](https://github.com/mindaugaskasp/diff-bro/releases/latest) or Homebrew |
| **Linux** (Ubuntu/Debian)     | [`diff-bro-v<version>.deb`](https://github.com/mindaugaskasp/diff-bro/releases/latest) or AppImage |

```bash
brew tap mindaugaskasp/tap
brew install --cask diff-bro
xattr -dr com.apple.quarantine "/Applications/Diff Bro.app"
```

Builds are **unsigned**, so SmartScreen and Gatekeeper warn on first launch (the
`xattr` line clears it on macOS) — see [packaging](docs/packaging.md).

## What it does

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compare**              | Two files or pasted text, split or inline, word-level highlights, in-view search, and a live re-diff when a file changes on disk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Understand structure** | JSON, YAML and XML compared as _data_: reordering keys or reformatting stops counting, and unchanged keys collapse away.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Excel**                | `.xlsx` workbooks as aligned grids — sheet tabs and cell-level highlights, with inserted rows and columns that don't cascade into false changes. Dates read as dates, hidden sheets and rows are marked, and formulas are compared as well as their results, so a total pasted over the formula behind it is caught rather than shown as unchanged. Headers are found under a title row rather than assumed to be row 1, and rows can be paired by the columns that name them — one column or several — so the same export sorted differently reads as the one figure that moved instead of as a rewrite. Set a tolerance — one of the presets or a threshold of your own, percentage or raw — and rounding noise stops counting; export the whole change list as a CSV.                                                                                                               |
| **CSV**                  | `.csv` and `.tsv` compare as text or, one toggle away, as the same grid — rows aligned by their first column, quoted fields kept whole.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Dependencies**         | A lockfile pair reads as the dependency moves it describes, not as the four thousand lines it is written in: which packages were added, removed, bumped or downgraded, the semver step of each, and — the part that matters — which of them you actually asked for rather than got carried along. `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `go.sum` and `composer.lock`. Nothing is fetched; every fact comes out of the file in front of you.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Huge files**           | Past 32 MB a file is indexed by line instead of loaded, and the rows you're looking at are read from disk as you scroll — a multi-gigabyte log opens in seconds. Marked as streamed, with the few actions that need the whole text saying so rather than half-working.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Keep**                 | Saved diffs: encrypted, tagged, optionally auto-expiring. Drag a row onto another to arrange the list yourself; starred rows stay above the rest. Your open tabs come back on the next launch, and the strip can be told to close the oldest comparison to make room for a new one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Share**                | One signed file only the recipients you ticked can open, carrying the expiry you chose so every copy dies at the same moment. Give a trusted key an email address and Diff Bro opens an addressed message in your own mail app with the sealed file on the clipboard — it never sends anything itself. The key swap rides the same rails: email your key from the My key dialog, and a key copied out of any chat app is offered — fingerprint first — when you press + Trusted key.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Export as image**      | A real screenshot of the diff view — your theme, panes and highlighting — cropped to the change and stitched if it's taller than the window. Snippets go the same way, and a Mermaid snippet leaves as its rendered diagram.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Snippets**             | An encrypted, tagged text library you can drag straight into the diff pane — two snippets compare like any two files, and editing one updates the comparison on screen. Per-language highlighting, live Mermaid (readable light or dark whatever the app is wearing), Markdown/Jira preview, and secret snippets that render as `****`. Every edit keeps the version it replaced — History in the snippet window lists them by timestamp, each diffed against its predecessor, any of them a copy away. Name one `Standup {{today}}` and the placeholder resolves as you save — `{{now}}`, `{{week}}`, `{{weekday}}` and the rest are listed under the field as you type. Naming is completed inline: type a few characters and the rest of the shared head of your existing names appears ahead of the caret, Tab to take it. Drag a row onto another to arrange the library by hand. |
| **Quick look-up**        | A global shortcut searches your snippets and diffs without raising the app; copy one straight to the clipboard, or capture a new one with `Ctrl/Cmd+N` — whatever you searched for becomes its name, and the body is syntax-coloured as you type in whatever language it turns out to be.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Stays out of the way** | On Windows, closing the window keeps Diff Bro in the notification area so the quick look-up shortcut still answers — right-click the icon to exit, and turn either that or start-at-sign-in off in Settings ▸ Desktop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Language**             | Every menu, dialog and label reads from one message catalogue, and Settings ▸ Appearance switches it — menus included, without a restart. English ships today; a new language is a data file, not a code change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Guided first run**     | Six coach marks over the real controls on a first launch — comparing, sealing, the library, then the way into Settings and around it — with four more if you want them. Each step points at a control and its button performs the action, so nothing opens unannounced. Back revisits a step, and everything it put on screen — the demo files, the example snippet — leaves when it does. Escape or Skip ends it for good; Help ▸ Show Tour brings it back.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Diagrams**             | Two Mermaid files compare as a picture, not as text — one diagram carrying both revisions, so an inserted node reads as one change instead of a rewrite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Tools**                | JSON, Base64, UUID, JWT, Epoch, URL, Lines, XML, checksums, a regex tester, find & replace, text encryption — rich panels, not blank text boxes. All of them live in their own sidebar section; star the ones you reach for and they stay at the top.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Merge conflicts**      | Registered as git's `difftool` **and** `mergetool`: `git mergetool` opens a real three-way view — the two branches either side, the file you are producing in the middle, and that middle one is a full editor. Each side is labelled with the branch it came from and read out of git's index, so no `<<<<<<<` ever reaches the screen; the chevrons in the gutters move a side across, F7 walks the conflicts, and where neither side is right you just type the answer. Thirty conflicted files are thirty stops, counted in the header. It writes the merged file back and tells git it is done — the one file Diff Bro writes over; everything else it produces is a new file you picked the place for.                                                                                                                                                                           |
| **Terminal**             | `diffbro compare a.json b.json` opens a comparison in the running app, and either side can name a git revision instead of a file — `diffbro compare HEAD~1:src/app.js src/app.js` reads the old copy straight out of the repository, so you never have to produce one first. `diffbro open` raises the app, `diffbro backup <path>` writes an encrypted archive. No port, no daemon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Yours to arrange**     | Twenty themes (Nord, Sepia, Solar, Nyan, Matrix, Volcano, Tide, Graphite, plus accessibility-grade Contrast and Beacon), shared tags, adjustable limits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

<details>
<summary>The smaller things</summary>

- **Drag & drop** files onto the window; it warns before discarding unsaved work.
- **Ctrl/Cmd+V** pastes straight into a comparison — including pasted text against a real file.
- **Copy diff** puts a git-style unified patch on the clipboard.
- **Quick look-up keys** — ↑/↓ browse, **→** steps into a preview or the tools, **←** steps back out, **Enter** opens, **Ctrl/Cmd+N** captures a new snippet without raising the app (or arrow to the _Create snippet_ row), **Tab** accepts the inline name completion, and **Ctrl/Cmd+Enter** saves it.
- **Resizable dialogs** — the snippet editor and tool windows resize from any edge and remember their size; existing snippets open read-only until you press Edit.
- **Save a tool's output** — anything a tool produced goes straight into the snippet library from its own window; you supply the name, the app fills the rest.
- **Uniform snippet names** — every name is sentence-cased on save, so a library grown over months still reads consistently.
- **Repair a pasted diagram** — Mermaid copied out of Word or Confluence arrives with `—>` where `-->` was, curly quotes and non-breaking spaces; **Repair** in the snippet editor puts them all back.
- **More terminal commands** — `diffbro open [<file>]` brings the app to the front (with a file, it fills the left side and waits for the right), `diffbro backup <path>` seals everything you have into a zip at a path you choose, `diffbro create snippet` opens a new snippet — add `--interactive` and it asks in the terminal instead (name — where Tab completes against the snippets you already have — then a syntax and as many lines as you like; `:wq` writes, `:q` discards, as vim does; Ctrl+C cancels) and tags it `cli`; it takes `--name`, `--syntax` and `--tag`, and reads the body straight from a pipe when there is no terminal to ask, `diffbro clipboard save` keeps what you just copied, and `diffbro help <command>` explains one. A second launch hands its arguments to the running window through Electron's single-instance lock.
- **The tools in full** — JSON (pretty/minify/sort, JSONPath filter, collapsible tree), Base64 (URL-safe, MIME wrap), UUID (v1/v4/v5/v6/v7, inspect, convert), JWT, Epoch, URL (editable query-param table), Lines (split, sort, dedupe, build a SQL `IN (…)` list), XML format + validate, find & replace, and AES-256-GCM passphrase encryption with an opt-in raw-key CBC decrypt for external payloads.

</details>

## Offline by construction

```mermaid
flowchart LR
    subgraph pc["your machine — all of it happens here"]
      direction LR
      r["renderer<br>sandboxed · no Node"] <-->|"validated IPC"| m["main process<br>files · crypto · dialogs"]
      m --> v[("saved diffs · snippets · keys<br>AES-256-GCM")]
      m --> k[["OS keychain<br>holds the key"]]
    end
    m x-- "blocked" --x net(("the<br>internet"))
```

- **Zero network** — a session-level kill switch, a strict CSP, a deny-all
  permission handler and a blocked `will-navigate`, not just a promise.
- **Encrypted at rest** — AES-256-GCM, the key held by your OS keychain, and
  never handed to the renderer.
- **Sealed sharing** — sign-then-encrypt, bound to the exact recipient set, with
  an expiry capped at one week. Details in the [security model](docs/security.md).

## A look around

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/spreadsheet-diff.png" alt="Two multi-sheet Excel workbooks compared as aligned grids: sheet tabs with per-sheet change counts, a tolerance control, a row-matching control and a change-register export, changed cells boxed, and an added row and an inserted column each shown as a striped gap on the side without them">
      <p align="center"><em>Excel workbooks as aligned grids.</em></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/diff-light.png" alt="The same JSON diff in the light theme — floating cards on a tinted ground">
      <p align="center"><em>Twenty themes, GitHub-style rendering.</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/save-encrypted.png" alt="Save dialog: name, tags, a Secure auto-expiring toggle, and an expiry of at most 24 hours">
      <p align="center"><em>Saved diffs are encrypted and auto-expire.</em></p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/empty-state.png" alt="The start screen listing supported file types (Excel, JSON, XML, YAML, CSV, Markdown, Mermaid, and any text or code file) beside a sidebar of saved diffs, shared diffs, snippets, tools, and tags">
      <p align="center"><em>Drop or choose two files of any text format.</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/diagram-diff.png" alt="Two Mermaid files compared as one diagram carrying both revisions: added nodes and edges in solid green, a removed node and its edges dashed in red, unchanged nodes as plain hairlines, a legend naming each status, and a status band counting the changed nodes and edges">
      <p align="center"><em>Mermaid files compare as a picture, not as text.</em></p>
    </td>
    <td width="50%" valign="top"></td>
  </tr>
</table>

## Build from source

Needs **Node 22.12+** — the version Docker and CI use.

```bash
nvm use          # or install Node 22.12+ yourself
npm install
npm run dev      # run it
npm run check    # lint + tests
```

No local Node? The same flow runs in Docker: `make dev`, `make check`, `make e2e`
(see [docker/README.md](docker/README.md) and `make help`).

Electron · Vue 3 · Pinia · Monaco. New formats plug in through the adapter
registry rather than into the viewer.

## Docs

| Doc                                                | What's in it                                                  |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [Architecture](docs/architecture.md)               | Processes, trust boundary, directory map                      |
| [IPC & security](docs/ipc-security.md)             | How renderer↔main talk, and what the sandbox blocks           |
| [Security model](docs/security.md)                 | Offline guarantee, sharing, keys, backup                      |
| [Sealed diff journey](docs/sealed-diff-journey.md) | Diagrams: how a shared diff is signed, encrypted and verified |
| [Packaging](docs/packaging.md)                     | Installers, signing notes, CI                                 |
| [Chocolatey](docs/chocolatey.md)                   | Plan + package skeleton for `choco install diffbro`           |
| [Glossary](docs/glossary.md)                       | Every term and abbreviation (IPC, CSP, GCM, …)                |
| [Standards](docs/standards.md)                     | Coding standards and the rules the build enforces             |

## License

[Mozilla Public License 2.0](LICENSE) — use it commercially and link it into
proprietary code; changes to Diff Bro's own files stay open.
