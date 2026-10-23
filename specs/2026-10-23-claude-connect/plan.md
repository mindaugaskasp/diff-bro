# Connect a Claude app in one click

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 8 / 8 steps |
| **Branch** | `feat/claude-connect` |
| **Started** | 2026-10-23 |
| **Finished** | 2026-10-23 |
| **Bugs found and fixed this iteration** | 2 / 2 |
| **Token baseline** | 2026-10-23T12:35:22Z |
| **Claude tokens used** | 16,636,338 (the window includes queuing three follow-up requests) |

## Problem

Settings ▸ Claude shows a command and a JSON block to copy. Connecting means
three steps:
- open a terminal;
- paste the command, or edit Claude Desktop's config file by hand;
- restart.

The copied command is also wrong. `claude mcp add` defaults to
`--scope local`, which registers the server for the terminal's current folder
only (`src/main/claudeSetup.js:13`). Pasted from a project folder, it gives
the diffbro tools to that one project.

## Solution

Settings ▸ Claude ▸ "Connect a Claude app" gets one row per app, each with a
status and a button.

- **Claude Code.**
  - **Finding the CLI:** main looks for the `claude` CLI at fixed install
    paths. A GUI app does not inherit the shell's `PATH`.
  - **Connect:** after a native confirmation, main runs
    `claude mcp add --scope user diffbro -- <this app> mcp` through
    `execFile`, with no shell.
  - **Status:** read from `mcpServers.diffbro` in `~/.claude.json`, where
    user-scoped servers live. It is one of: not connected, connected, or
    pointing at an older copy of Diff Bro (then **Update** removes and re-adds
    it).
- **Claude Desktop** (macOS and Windows, which are the platforms it ships on).
  - **Connect:** after a native confirmation, main merges
    `mcpServers.diffbro` into `claude_desktop_config.json` and leaves every
    other key alone. It writes atomically, backs up the previous file first,
    and refuses to touch a file that does not parse.
  - The row then says to restart Claude Desktop.
- **Manual setup stays.** The copy blocks remain under "Or set it up by hand",
  and the command gains `--scope user`.

| option | why not |
|---|---|
| Spawn `claude` through a login shell to get the user's PATH | runs the user's shell rc files from inside the app |
| Write `~/.claude.json` directly | that file is Claude Code's own state, so its CLI is the supported writer |
| `claude mcp get diffbro` for status | health-checks the server by launching a second Diff Bro, about a second each time Settings opens |
| A Disconnect button | out of scope; `claude mcp remove diffbro` or the Desktop config does it |

## Scope

**In:**
- the `--scope user` fix;
- the core (`claudeConnectCore.js`) and glue (`claudeConnect.js`);
- IPC `claude:apps` and `claude:connectApp`;
- store actions;
- the `ClaudeSetup.vue` rows;
- i18n;
- the sweep surface.

**Out:**
- Disconnect;
- Linux Claude Desktop, which has no official build;
- `.cmd` npm shims on Windows, which `execFile` cannot spawn, so the manual
  command shows instead.

## Design

- **Each app is a row:** name, then status in `--text-meta`, then a `.btn
  .btn-sm`. The connected state uses `AppIcon check` with `--ok` beside the
  status word.
- **The manual blocks** are unchanged in style, under a `.setup-label`
  heading.

### Theme verdict — all 20

Only existing roles are used: `.btn`, `--text-meta`, `--ok`, and the
`.setup-block` already swept. They are measured by the `claude-settings`
surface; a status probe is added and checked on all 20.

## Security rules touched

- **Rule 1 (offline).** Main opens no socket. It spawns the user's own `claude`
  CLI, as the mail hand-off hands off to the user's mail client. That spawn
  carries `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and
  `DISABLE_AUTOUPDATER=1`.
- **Rule 7 (leaving the sandbox).** A new subprocess and a write to another
  app's file, fenced as follows:
  - The executable comes from a fixed candidate list computed in main.
  - The argv and the server entry are built in main from `process.execPath`.
  - The renderer names only the target, `'code'` or `'desktop'`.
  - Main asks for confirmation itself, so the renderer cannot skip it.
- **Rule 6 (untrusted input).** `~/.claude.json` and the Desktop config are
  read with size caps and shape checks. A file that won't parse is never
  rewritten.

## Test plan

- **unit** `tests/main/claudeSetup.test.js`: the command carries
  `--scope user` (red first).
- **unit** `tests/main/claudeConnectCore.test.js`:
  - the candidate paths for each platform;
  - the add and remove argv;
  - status absent / current / stale;
  - the Desktop merge keeps other keys and other servers;
  - an invalid file is refused;
  - an oversized file is refused;
  - the Desktop path for each platform, and none on Linux.
- **unit** `tests/renderer/features/claude/claudeStore.test.js`: `loadApps`
  and `connectApp` refresh the status.
- **e2e** `e2e/claude-connect.spec.mjs`:
  - a fake `claude` in the profile's `HOME/.local/bin` records its argv;
  - Connect, after the confirmation, runs `mcp add --scope user diffbro -- … mcp`;
  - a seeded `~/.claude.json` reads as connected.
  - (Linux: there is no Desktop row.)

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | the feature table moved to `docs/features.md`, which is updated instead |
| `docs/features.md` | yes | "Use with Claude": one-click Connect |
| `docs/security.md` | yes | the `claude` subprocess and the Desktop config write, as sandbox exits |
| `docs/standards.md` | yes | rule 7: list the new exits |
| `docs/screenshots` | no | Settings ▸ Claude is not captured |
| `docs/roadmap.md` | no | a refinement |

## Implementation plan

- [x] 1. `--scope user` in `claudeSetup` (red → green)
- [x] 2. `claudeConnectCore.js` and its tests
- [x] 3. `claudeConnect.js` glue and IPC; preload
- [x] 4. Store: `loadApps` / `connectApp`, with tests
- [x] 5. `ClaudeSetup.vue` rows, i18n, pseudolocale; sweep probe
- [x] 6. e2e with a fake `claude` CLI
- [x] 7. Docs: README, security.md, standards rule 7
- [x] 8. `/validate`, `npm run check`, `make e2e`. Connecting on the host was left to the user, since it changes their Claude config

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | the user's own install paths are checked before system-wide ones | the native installer uses `~/.local/bin`; found because the host's Homebrew `claude` shadowed the e2e fake | system-wide first |
| 2026-10-23 | the "not installed" e2e skips where a system-wide `claude` exists | that state cannot be produced on such a machine; Docker runs it | a test hook in main |
| 2026-10-23 | status from `~/.claude.json`, writes through the CLI | reading is cheap and safe; the CLI is the supported writer | `claude mcp get`, which launches the server |

## Validation

- [x] `/validate`: comments swept; security rules 1, 6 and 7 re-checked and
  documented in `docs/security.md` and in standards rule 7.
- [x] `npm run check` exits 0: 3913 tests pass, and coverage is
  95.41 / 88.50 / 95.99 / 96.43.
- [x] UI seen running:
  - `e2e/claude-connect.spec.mjs` passes, with its third test skipped on this
    Mac and run in Docker.
  - Full `make e2e`: 556 passed, 4 skipped.
  - Theme sweep `claude-connect`: 80 measurements across 20 themes, all at or
    above their floors.
  - A host screenshot of the rows.
- [x] Docs-impact "yes" done: `docs/features.md`, `docs/security.md`,
  `docs/standards.md`.
- [x] Token usage measured: a total of 16,636,338 (input 82, output 35,970,
  cache write 65,190, cache read 16,535,096).

**Outcome:** Settings ▸ Claude connects Claude Code and Claude Desktop in one
click, and the copied command now registers at user scope.
