# Architecture

Three processes with a hard trust boundary: the **renderer** is sandboxed and
never touches Node or Electron; everything privileged (filesystem, dialogs,
crypto, keys) lives in **main**; the **preload** exposes only a small, validated
`window.api` IPC surface between them.

```mermaid
flowchart TB
    subgraph R["Renderer — Vue 3 (sandboxed: no Node, no Electron)"]
        ui["UI<br/>DiffViewer · Saved diffs · Snippets · Tools dialogs"]
        stores["Pinia stores<br/>diff · vault · snippets"]
        adapters["Adapter registry<br/>text → { kind, … } comparable"]
        ui --> stores --> adapters
    end

    subgraph PR["Preload — contextBridge"]
        api["window.api<br/>small validated IPC surface"]
    end

    subgraph M["Main — Node (all privileged work)"]
        killswitch["Network kill-switch<br/>cancels every non-local request"]
        fileio["File access<br/>dialogs · reads · binary/size/encoding checks"]
        vaultkey["Vault crypto<br/>AES-256-GCM · key via OS keychain"]
        sealing["Identity + sealing<br/>Ed25519 sign · X25519 + AES-256-GCM seal"]
        cfg["Config + snippet + text-tool crypto<br/>passphrase (scrypt) AES-256-GCM"]
    end

    disk[("Local files &<br/>userData")]

    stores <-->|"invoke / events"| api
    api <--> fileio
    api <--> vaultkey
    api <--> sealing
    api <--> cfg
    fileio --> disk
    sealing --> disk
    vaultkey --> disk
```

### Rules encoded in that picture

- **All file access and crypto happen in main.** The renderer only calls the
  small `window.api` surface; keys never cross the IPC boundary.
- **Adapters decouple formats from viewers.** Everything is normalized into a
  comparable (`{ kind, … }`); new formats plug into the registry without
  touching `DiffViewer`.
- **The network kill-switch guarantees offline operation** — every request that
  isn't `file://` / `devtools://` / `blob:` / `data:` (or the Vite dev server in
  dev mode) is cancelled at the session level.

### Directory map

- `src/main` — Electron main: window, menu, file dialogs + reads (binary/size
  detection, `chardet`/`iconv-lite` encoding), and the pure, unit-tested crypto
  cores: `sealing.js` (sealed diff sharing), `vaultCrypt.js` (saved-diff vault),
  `snippetSealing.js` (snippet export), `textCrypt.js` (Tools encrypt/decrypt),
  `configBackup.js` (config backup). `share.js` is the thin Electron glue.
- `src/preload` — the `contextBridge` `window.api`.
- `src/renderer` — the Vue app: `adapters/`, `stores/` (Pinia), and
  `components/` (viewer, sidebar, dialogs), plus pure `utils/`
  (`textFormats`, `sqlFormat`, `base64`, `detectLanguage`).
- `docs/` — this file, plus [security.md](security.md) and
  [packaging.md](packaging.md).
- `tests/` — mirrors `src/` (`tests/main`, `tests/renderer/{stores,utils,adapters}`).

See [DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) for the roadmap.
