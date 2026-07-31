# DiffBro — IPC & security architecture

DiffBro is an **offline-only** desktop app built on Electron. Its whole security
posture rests on one idea: **the renderer (the UI) is treated as hostile.** If a
bug or a malicious diff ever ran code in the renderer, it must not be able to
read your keys, touch arbitrary files, or send anything over the network.

Electron runs two separate OS processes, and everything below is about the wall
between them:

- **Main process** — trusted. Has Node, `fs`, `crypto`, dialogs, the OS
  keychain. All real work happens here.
- **Renderer process** — sandboxed and untrusted. Vue + Pinia only. No Node, no
  Electron, no `fs`, no network.

They cannot call each other's functions directly. They communicate **only** over
**IPC** (Inter-Process Communication) — named message channels — and the renderer
can reach those channels **only** through a tiny, fixed bridge that the preload
script exposes as `window.api`.

---

## The processes and the bridge

```mermaid
flowchart LR
  subgraph REND["RENDERER — sandboxed, untrusted"]
    UI["Vue components &amp; Pinia stores<br/>no Node · no Electron · no fs · no network"]
  end

  subgraph PRELOAD["PRELOAD — contextBridge"]
    API["window.api<br/>the ONLY surface the renderer can call"]
  end

  subgraph MAIN["MAIN PROCESS — trusted (Node · fs · crypto)"]
    IPC["ipcMain handlers<br/>validate every call"]
    FILES["files.js<br/>path allowlist + per-type size caps"]
    XLSX["xlsx reader<br/>bomb caps · no formulas · DOCTYPE reject"]
    VAULT["vaultCrypt / sealing<br/>AES-256-GCM · Ed25519"]
    LOGGER["logger.js<br/>local daily error log"]
    SEC["security.js<br/>kill switch · deny-all perms · will-navigate"]
  end

  subgraph OS["OS resources"]
    DISK[("Disk &amp; userData<br/>files · settings · logs")]
    KEY[("OS keychain<br/>safeStorage")]
    NET(("Network"))
  end

  UI -->|"window.api.foo()"| API
  API -->|"ipcRenderer.invoke('channel')"| IPC
  IPC --> FILES
  IPC --> XLSX
  IPC --> VAULT
  IPC --> LOGGER
  FILES --> DISK
  LOGGER --> DISK
  VAULT --> KEY
  SEC -->|"cancels every non-file/blob/data request"| NET
```

Every arrow the renderer participates in goes **through `window.api` → IPC**.
There is no other door.

---

## What is blocked, and where

These are the non-negotiables from `CLAUDE.md`, and the file that enforces each:

| Guard | What it stops | Where |
|---|---|---|
| **Sandbox + `contextIsolation`** | Renderer has no Node/Electron globals; can't `require('fs')` | `window.js` (webPreferences) |
| **Network kill switch** | `webRequest.onBeforeRequest` cancels every request that isn't `file:`/`blob:`/`data:` (fetch, XHR, images, workers…) | `security.js` |
| **CSP** | `connect-src 'self'`, `object-src 'none'` — second layer against outbound requests | renderer CSP meta |
| **Deny-all permission handler** | `setPermissionRequestHandler` rejects camera, clipboard-read, geolocation, everything | `security.js` |
| **`will-navigate` / `setWindowOpenHandler`** | Renderer can't navigate away or open external windows | `security.js` |
| **Path provenance allowlist** | `file:read` only serves a path the user actually picked or dropped — not one the renderer invents | `files.js` |
| **Keys never cross IPC** | Vault/identity keys stay behind `safeStorage`; only ciphertext is ever returned | `vault.js`, `vaultCrypt.js` |
| **Untrusted-input caps** | Import files get size caps, shape validation, recomputed fingerprints; `.xlsx` gets decompression-bomb caps and a cell budget | `files.js`, `xlsx/*`, `share.js` |
| **No injection sinks** | `v-html`, `eval`, `new Function`, `innerHTML` are ESLint-banned | `eslint.config.mjs` |
| **Capture rect clamped** | `image:capture` / `image:appendSlice` screenshot only a region clamped inside the window's own content, never a forged or unbounded one; a stitched export is capped in height so a renderer-driven loop can't exhaust memory, and the bitmap stays in main | `captureRect.js`, `stitchBitmap.js`, `diffImage.js` |

The renderer **cannot**: read a file by path it made up, obtain a private key,
evaluate a spreadsheet formula, or make a network request. Each of those is
either impossible (no API for it) or actively cancelled.

---

## Representative flows

### 1. Opening a file to diff (incl. `.xlsx`)

The renderer never handles a filesystem path it could forge — main resolves the
path from a real dialog/drop, records it in an allowlist, then reads it.

```mermaid
sequenceDiagram
  autonumber
  participant R as Renderer (sandbox)
  participant P as Preload (window.api)
  participant M as Main (files.js)
  participant D as Disk

  R->>P: window.api.openFile('left')
  P->>M: invoke('file:open')
  M->>M: showOpenDialog → allow(path)
  M->>D: read bytes (size-capped per file type)
  alt looks like .xlsx (PK zip magic)
    M->>M: readXlsx — bomb caps, no formulas, reject DOCTYPE
    M-->>R: { kind:'spreadsheet', sheets } or { error:'xlsx' }
  else text
    M->>M: detect encoding, decode
    M-->>R: { name, content } or { error:'binary' }
  end
  Note over R: renderer received data only — never a raw path primitive
```

### 2. Vault crypto — the key never leaves main

Saved diffs are encrypted, but the renderer only ever sees ciphertext. The key
is unlocked from the OS keychain inside main and never crosses the bridge.

```mermaid
sequenceDiagram
  autonumber
  participant R as Renderer
  participant M as Main (vault.js)
  participant K as OS keychain (safeStorage)

  R->>M: invoke('vault:encrypt', plaintext, aad)
  M->>K: unlock the per-install vault key
  M->>M: AES-256-GCM (metadata bound as AAD)
  M-->>R: { iv, data }
  Note over R,M: only ciphertext returns — there is no IPC channel that hands back key material
```

### 3. Local error logging (this feature)

Uncaught errors are written to a **local, daily-rotated** file so you can paste
it into a bug report. Nothing is transmitted — that would violate the offline
guarantee. The renderer forwards a small record; main does all the fs work.

```mermaid
sequenceDiagram
  autonumber
  participant R as Renderer (errorStore)
  participant M as Main (logger.js)
  participant D as Log dir (configurable)

  Note over R: window.onerror / unhandledrejection / Vue errorHandler
  R->>M: invoke('log:error', { message, stack, context })
  M->>M: add app version+platform, redact home dir → ~
  M->>M: format entry, cap the day's file, pick diffbro-YYYY-MM-DD.log
  M->>D: append (prune files older than 7 days)
  Note over M,D: LOCAL ONLY — never sent anywhere
  R->>M: (from the dialog) log:read → copy to clipboard, or reportIssue → open GitHub in OS browser
```

Even the "Report on GitHub" action doesn't send anything from the app: it hands a
**fixed** issue URL to the OS browser (the only outward link, chosen in main —
the renderer can only trigger it, never choose the address).

---

## Why the renderer is untrusted

A diff tool opens files from anywhere and, in future, renders rich content
(Mermaid, spreadsheets). Any of that could carry a payload that executes in the
renderer. By assuming that has already happened, the boundary above means the
worst a compromised renderer can do is misbehave **inside its sandbox** — it
still can't reach your keys, your unrelated files, or the network. That is the
whole point of keeping every privileged capability behind a small, validated set
of IPC handlers.
