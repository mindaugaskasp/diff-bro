# Claude connection: read DiffBro from a Claude session, propose changes for review

| | |
|---|---|
| **Status** | approved — builds after sidebar-workspace ships |
| **Progress** | 0 / 12 steps |
| **Branch** | `feat/claude-mcp` |
| **Started** | 2026-10-23 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | not yet |
| **Claude tokens used** | not measured |

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

- [ ] 1. Rule-2 audit of `@modelcontextprotocol/sdk` (stdio import path,
      transitive tree, install scripts, `npm audit`); record the result and
      choose SDK or hand-rolled subset.
- [ ] 2. Prove the headless mode: `diffbro mcp` starts Electron without a
      window, skips the single-instance lock for this mode, keeps stdout clean of
      Chromium logging, and obtains the vault key via `safeStorage`. Spike on
      macOS, Windows, Linux, because each keychain behaves differently headless.
      **Stop and re-plan if any platform cannot.**
- [ ] 3. `src/main/mcpProtocol.js` (pure) + tests.
- [ ] 4. `src/main/mcpTools.js` (pure, scope-checked) + negative tests.
- [ ] 5. `src/main/inboxStore.js`: encrypted, atomic, capped, expiring + tests.
- [ ] 6. `src/main/mcp.js`: thin glue wiring stdio, settings and stores.
- [ ] 7. Settings section + IPC + activity log.
- [ ] 8. Renderer `inboxStore` + `fs.watch` bridge in main (path computed in
      main; renderer names no file).
- [ ] 9. Home "From Claude" card list; Accept opens comparisons in a new tab.
- [ ] 10. e2e spec.
- [ ] 11. Docs (all "yes" rows).
- [ ] 12. `/validate`; re-verify the share roundtrip in Docker (rule 5 says so
      for any crypto-adjacent change).

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | stdio MCP, launched by the client | no socket in DiffBro; same footing as `mailto:` | HTTP/SSE, local socket |
| 2026-10-23 | writes are inbox proposals the user accepts | the user asked to "check later"; and Claude never mutates the library unseen | direct writes |
| 2026-10-23 | secret snippets and received diffs never exposed | their promises are to the user and to the sender respectively | a scope toggle for them |
| 2026-10-23 | depends on sidebar-workspace (Home) for the inbox surface | that is where "to review" belongs; without it, a fifth sidebar section would bring back the stacking E removes | a dialog |
| 2026-10-23 | approved by the owner on one condition: an **"Enable Claude MCP connection"** checkbox in Settings, off by default, gated by a warning the user confirms | sending library contents to the user's Claude client is acceptable only as the user's explicit, informed opt-in | an implicit enable when a scope is ticked |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] e2e green, headless mode verified on all three platforms
- [ ] every Docs-impact "yes" done
- [ ] token usage measured

**Outcome:**
