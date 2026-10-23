# Claude connection: read DiffBro from a Claude session, propose changes for review

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 11 / 12 steps; Windows unverified |
| **Branch** | `feat/claude-mcp` |
| **Started** | 2026-10-23 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 2 / 2 |
| **Token baseline** | 2026-10-23T05:06:37Z |
| **Claude tokens used** | 30,561,937 (cache read 30.17M, output 137k), 2026-10-23T05:06Z → 05:47Z |

## Problem

A Claude session (Claude Code, Claude Desktop) cannot see what the user keeps in
DiffBro. Today the user has to copy a snippet out, or paste both sides of a
saved diff, into the chat by hand. The reverse direction doesn't exist at all:
Claude can't hand back a snippet or a comparison for the user to look at later.
It can only print text into the chat, where it scrolls away.

Wanted:
1. **Read:** a Claude session can list and read the user's snippets and saved
   diffs, and run the stateless tools (format JSON, decode JWT, …).
2. **Write, for review:** a Claude session can *propose* a snippet or a
   comparison. Nothing lands in the library until the user accepts it in the
   app.

## The constraint that shapes everything

Hard rule 1: *the app never makes network requests*, and per standards.md the
guarantee holds "because nothing in main opens a socket". A Model Context
Protocol (MCP) server can be reached two ways:

- **HTTP/SSE transport:** a listening socket. **Refused** outright.
- **stdio transport:** the Claude client launches a process and speaks JSON-RPC
  over its stdin/stdout. No socket is opened by DiffBro.

The data then leaves the machine **through the user's Claude client**, exactly
as an emailed diff leaves through the user's mail client (`mail.js`). DiffBro
does not send; it answers a process the user configured. This is the same
argument that admitted `mailto:`, and it is only honest if the connection is
**off by default, scoped, visible and revocable**. `docs/security.md` must say
so in words, not imply it.

## Solution

**`diffbro mcp`**: a headless mode of the same signed app binary, launched by
the Claude client over stdio. The existing `diffbro` shim (`cliShim.js`) already
puts the command on PATH.

```
Claude client ──stdio JSON-RPC──▶ diffbro mcp (headless Electron main, no window)
                                     │ reads: data-dir JSON (vault, snippets)
                                     │        content decrypted in-process via safeStorage
                                     │ writes: data-dir/inbox/*.json (atomic, encrypted)
                                     ▼
                              running Diff Bro ── watches inbox/ ──▶ Home › "From Claude · 2 to review"
```

- **Reads:** the vault and snippet files are JSON in the data directory
  (`persist.js` → `storeLoad`). Names, tags and timestamps are plaintext;
  content is encrypted with the vault key, which main obtains through
  `safeStorage`. The headless process is the same app identity, so it gets the
  same key from the OS keychain. **Keys never leave main-process code in either
  process**; MCP responses carry plaintext content only for scopes the user
  enabled.
- **Writes are proposals, never mutations.** The MCP process never writes
  `vault`/`snippets` files. It writes one encrypted file per proposal into
  `inbox/` (write-temp-then-rename, so a half-written proposal is never seen).
  The running app already re-reads persisted stores (the Quick Look path in
  `vaultStore` does), so it watches `inbox/` and shows proposals on **Home**
  (from the sidebar-workspace spec) as *From Claude · N to review*, with
  Preview / Accept / Discard. Accept turns the proposal into a normal snippet or
  saved diff. Discard deletes it. Unreviewed proposals expire after 7 days,
  matching `MAX_TTL_MS`.
- **No concurrency on library data:** only the app writes the library; only the
  MCP process writes `inbox/`; only the app deletes from it.

| option | why not |
|---|---|
| MCP over HTTP/SSE, or a localhost port | opens a socket in DiffBro: breaks rule 1 outright |
| a Unix domain socket / named pipe into the running app | still a socket in main; standards.md says any socket proposal "starts from there" and this design doesn't need one |
| a plaintext export folder Claude reads | plaintext of every snippet on disk; secret snippets' "never lands on disk" guarantee breaks |
| the MCP process writes straight into the vault | two writers on one file; and Claude could change the library without the user seeing it |
| `@modelcontextprotocol/sdk` | **to verify in step 1**: expected to pull an HTTP server stack for its other transports. If its stdio path can be imported without that tree and passes the rule-2 audit, use it; otherwise hand-roll the stdio JSON-RPC subset (initialize, tools/list, tools/call, resources/list, resources/read), with the reason written at the implementation |

## Scope

**In**

Settings → **Claude connection** (off by default):
- master switch: a checkbox, **"Enable Claude MCP connection"**, unchecked by
  default. Ticking it opens a warning the user must confirm before it takes
  effect: what Claude can read once scopes are on, that the contents are sent to
  Anthropic by the user's Claude app, that secret snippets and received diffs
  are never shared, and that unticking revokes access on the next call. Until
  it is ticked, `diffbro mcp` answers every call with an error, and the scopes
  below are disabled
- **Copy setup command** (`claude mcp add diffbro -- diffbro mcp`) and the
  Claude Desktop JSON snippet, shown only once enabled
- scopes, each off until ticked: *Snippets (read)*, *Saved diffs (read)*,
  *Tools (run)*, *Propose snippets*, *Propose comparisons*
- an activity list: every call with time, tool name and item names (no
  contents), clearable, with **Revoke** (master switch off)

Tools exposed:

| tool | scope | returns |
|---|---|---|
| `list_snippets(query?, tags?)` | Snippets | id, name, language, tags, updatedAt — no content |
| `get_snippet(id)` | Snippets | content, with template variables listed |
| `list_saved_diffs(query?, tags?)` | Saved diffs | id, name, tags, createdAt, expiresAt, ±counts |
| `get_saved_diff(id, format: "sides"\|"unified")` | Saved diffs | both sides, or a unified diff |
| `compare_texts(left, right)` | Tools | unified diff + stats; touches no stored data |
| `run_tool(tool, input, options?)` | Tools | the same pure functions as the Tools panel |
| `propose_snippet(name, content, language?, tags?, note)` | Propose snippets | proposal id; lands in the inbox |
| `propose_comparison(name, left, right, note)` | Propose comparisons | proposal id; lands in the inbox |

Resources: `diffbro://snippet/{id}`, `diffbro://diff/{id}`, under the same scopes.

**Never exposed, whatever the scopes**
- **secret snippets** (`secretSnippet.js`): not listed, not readable. Their
  guarantee is that contents never land somewhere readable, and an AI context
  window is somewhere readable
- **received diffs** (`from` set): the sender sealed them for the user, not for
  a third party. Off until a separate, explicitly worded scope exists (out here)
- keys, fingerprints, trust store, identity, settings, logs
- anything expired: the same `expiresAt` filter as `vault.active`

**Out:** remote/hosted MCP; Claude editing or deleting existing items (only
proposals); received-diff scope; per-item ACLs; proposals that edit an existing
item (v2: "propose edit" showing a diff against the current version, which this
app is unusually good at).

## Design

- Settings: one `BaseDialog` section, `SettingToggle` rows, copy via
  `window.api.copyText`. Copy follows the "never re-sell the offline guarantee"
  rule: state the fact ("Claude can read the snippets you allow here. Contents
  are sent to Anthropic by your Claude app when it uses them.") and skip the
  posture.
- Home inbox: a card list in the `.row-2` + glyph-well language, hue `received`.
  Accepting a comparison opens it in a new tab first, so review happens in the
  diff view.
- No new colours. Theme verdict is covered by the sidebar-workspace tokens; add
  `sidebar-inbox` to the theme sweep.

## Security rules touched

| rule | how this stays inside it |
|---|---|
| 1 offline | stdio only, no listening socket, no outbound request from DiffBro; data leaves via the user's configured client, documented like `mailto:` |
| 2 dependencies | SDK audited in step 1 or the subset hand-rolled; zero new production deps is the target |
| 3 renderer/main | the MCP mode is main-process only; the renderer only sees the settings and the inbox through new, validated IPC (`claude:settings`, `inbox:list`, `inbox:accept`, `inbox:discard`) |
| 4 keys | the vault key stays in main in both processes; no MCP tool returns key material |
| 5 crypto | inbox files are encrypted with the vault key and their metadata is bound as AAD, like saved diffs; no change to sealing or audience binding |
| 6 untrusted input | **everything from the Claude client is hostile**: size caps (content ≤ 1 MB, name ≤ 200 chars, ≤ 20 tags), shape validation on every tool call, proposal count capped (≤ 50 pending), names rendered via text interpolation only, `note` treated as plain text |
| 7 sandbox exits | none added: no `openExternal`, no paths handed to the OS |
| 8 injection sinks | proposals render only through Vue text interpolation and the existing Monaco/diff views |

Threat note: any process running as the same OS user can launch `diffbro mcp`.
That's the same reach that user already has over the keychain item. The master
switch is read on every call, so turning it off revokes access immediately.

## Test plan

- **unit (main):** `tests/main/mcpProtocol.test.js` covers request parsing, size
  caps, unknown method → JSON-RPC error, and the switch off → every call
  refused. `tests/main/mcpScopes.test.js` checks each tool against each scope
  combination, and that secret snippets and received diffs are never returned
  even with every scope on (negative tests). `tests/main/inboxStore.test.js`
  covers atomic write, tamper → rejected (AAD), expiry, and the 50-cap.
- **unit (renderer):** `tests/renderer/stores/inboxStore.test.js` covers accept
  → snippet/diff created, discard → file removed, re-read on change.
- **e2e:** `e2e/claude-mcp.spec.mjs` spawns `diffbro mcp` against a throwaway
  `--user-data-dir`, speaks JSON-RPC over its stdio, and asserts: off by
  default; enabled snippets-read lists the seeded non-secret snippet only;
  `propose_snippet` appears on Home and Accept puts it in Snippets.
- **red → green:** the "secret snippet never listed" test is written against a
  stub that lists everything and watched failing first.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | yes | new feature row, "Use with Claude", with the setup command |
| `docs/security.md` | yes | the stdio argument in full, what leaves and through whom, what is never exposed |
| `docs/ipc-security.md` | yes | the four new IPC channels |
| `docs/standards.md` | yes | rule 1 gains the MCP paragraph next to the email one; rule 7 notes no new sandbox exit |
| `docs/roadmap.md` + `brand/roadmap.svg` | yes | new track |
| `docs/screenshots` | no | settings/inbox aren't in the captured set; revisit if a frame is added |

## Implementation plan

- [x] 1. Rule-2 audit of `@modelcontextprotocol/sdk` 1.32.1: **rejected**.
      17 runtime dependencies (express, hono, cors, eventsource, jose,
      cross-spawn, …) for five methods. Hand-rolled in `mcpProtocol.js`.
- [x] 2. Headless mode proven on **macOS** (host) and **Linux** (Docker e2e and
      theme sweep):
      - no window, no single-instance lock;
      - clean stdout, about 0.6 s to answer;
      - vault key via `safeStorage`.

      **Windows is not verified**: no Windows machine here. Open below.
- [x] 3. `mcpProtocol.js` (pure) + tests.
- [x] 4. `mcpTools.js` / `mcpLibrary.js` / `mcpInput.js` / `mcpResources.js`
      (pure, scope-checked) + negative tests. The secret-snippet test was seen
      red against a list-everything stub.
- [x] 5. `inboxStore.js`: encrypted, atomic, capped, expiring + tests.
- [x] 6. `mcp.js`: glue for stdio, the grant and the stores.
- [x] 7. Settings ▸ Claude (`features/claude`) + `claude.js` IPC + signed grant
      (`mcpGrant.js`) + activity log (`claudeFiles.js`).
- [x] 8. Renderer `claudeStore` + an `fs.watch` bridge in main
      (`inbox:changed`; the path is computed in main).
- [x] 9. Home "From Claude · N to review". **Preview** opens a tab and saves
      nothing. **Accept** saves through the ordinary stores; a comparison
      becomes a kept saved diff.
- [x] 10. `e2e/claude-mcp.spec.mjs` (6 tests); `claude-settings` and
      `claude-inbox` added to the theme sweep.
- [x] 11. Docs (all "yes" rows).
- [x] 12. `/validate`; share roundtrip re-verified in Docker (`sharing.spec`,
      inside the full `make e2e`).

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | stdio MCP, launched by the client | no socket in DiffBro; same footing as `mailto:` | HTTP/SSE, local socket |
| 2026-10-23 | writes are inbox proposals the user accepts | the user asked to "check later"; and Claude never mutates the library unseen | direct writes |
| 2026-10-23 | secret snippets and received diffs never exposed | their promises are to the user and to the sender respectively | a scope toggle for them |
| 2026-10-23 | depends on sidebar-workspace (Home) for the inbox surface | that is where "to review" belongs; without it, a fifth sidebar section would bring back the stacking E removes | a dialog |
| 2026-10-23 | branch from `improvement/sidebar-workspace`, not main | the inbox lives on Home, which only exists on that unmerged branch | waiting for it to merge |
| 2026-10-23 | hand-roll the protocol | SDK: 17 runtime deps incl. an HTTP server stack | `@modelcontextprotocol/sdk` |
| 2026-10-23 | grant HMAC under HKDF(vault key) | a plain settings flag bypasses the keychain ACL | `settings.json` flag |
| 2026-10-23 | a proposed language must be one the editor knows, else none | it reaches Monaco | free text |
| 2026-10-23 | e2e spawns the MCP child with `--use-mock-keychain` | Playwright launches the app with Chromium's mock keychain, so its key opens only under the same switch | a real-HOME launch for this spec |
| 2026-10-23 | `.dialog-note` (ui.css, 36 dialogs) moves to `--text-meta`, at the owner's request | on `--text-dim` it read 3.44–4.31 on solar, nord, sepia and bloom; now ≥ 5.43 on all 20 | a Claude-pane-only override (tried first, removed) |
| 2026-10-23 | Settings checkbox labels (`SettingToggle`) move to `--text-meta` too, at the owner's request | same 3.44–4.31 failure; probed in the `claude-settings` sweep | — |
| 2026-10-23 | approved by the owner on one condition: an **"Enable Claude MCP connection"** checkbox in Settings, off by default, gated by a warning the user confirms | sending library contents to the user's Claude client is acceptable only as the user's explicit, informed opt-in | an implicit enable when a scope is ticked |

### Amendments made while building

- **`run_tool` dropped.** The tool functions are renderer `utils/`; moving them
  to `src/shared` is churn for something Claude does itself. The *Tools* scope
  became **Compare texts it sends** (`compare_texts`).
- **The grant is signed, not a setting.** Settings asked only for a checkbox; a
  plain flag in `settings.json` would let any process that writes that file
  switch the connection on, sidestepping the keychain ACL. Main MACs it under an
  HKDF of the vault key.
- **IPC**: `claude:connection`, `claude:setConnection`, `claude:activity`,
  `claude:clearActivity`, `inbox:list`, `inbox:read`, `inbox:discard`, plus the
  `inbox:changed` event. `inbox:accept` became renderer-side: read, add
  through the store, discard. The library keeps one writer.
- **Grant, activity and inbox live in userData**, not the data folder. Consent
  is per install; a restored or moved data folder must not carry it.
- **The setup command names the app binary, not the `diffbro` shim.** On
  Windows the shim is `start ""`, which detaches and drops stdio.
- **`AAD` formulas and `unifiedDiff.js` moved to `src/shared`**, so main and
  the renderer cannot drift.

## Validation

- [x] `/validate`: comments trimmed to one-line whys. Conventions clean: lint,
      size caps, layering, tests mirror subjects. Security verified, see
      quality-audit.md.
- [x] `npm run check`: exit 0. 3824 passed / 2 skipped, coverage 95.35 / 88.35
      / 95.88 / 96.39, i18n 1366/1366, structure clean.
- [x] e2e:
      - `make e2e` (Linux): 540 passed, 0 failed, 4 skipped (macOS-only).
      - `claude-mcp.spec` on the macOS host: 6/6.
      - Headless mode is verified on macOS and Linux. **Windows: not verified.**
- [x] theme sweep `claude-settings` + `claude-inbox`: 140 measurements across
      20 themes, all above their floors (after the intro fix).
- [x] every Docs-impact "yes" done: README, security.md, ipc-security.md,
      standards.md, roadmap.md + roadmap.svg.
- [x] token usage measured.

**Bugs found and fixed, each red → green:**
1. Enabling sent a reactive Proxy over IPC ("An object could not be cloned"),
   so the grant was never written. Seen red in `claude-mcp.spec`.
2. The MCP process read the vault key once at startup. A Claude session started
   before the app had made a key stayed off forever. It now retries per request.
   `claude-mcp.spec` › "a session started before the app has a key…" is red on
   the old `mcp.js` and green on the fix.

**Outcome:** built and green on macOS and Linux. **Status stays in-progress for
one item:** the plan's step 2 requires a Windows spike, so someone needs to
check by hand on Windows that `"<Diff Bro.exe>" mcp`, launched by Claude
Desktop, keeps its stdio pipes and answers `initialize`. Until then, Windows is
not advertised.

**Windows check automated:** `ci.yml`'s Windows `check` job now packages
`Diff Bro.exe` (`electron-builder --win --dir`) and runs `scripts/mcp-smoke.mjs`
against it. It checks that the exe answers `initialize`, refuses while off, and
exits on EOF. The job runs on a PR to main; its first green run closes this
item.
