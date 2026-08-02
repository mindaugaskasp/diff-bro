---
name: validate
description: Audit the current change against DiffBro's engineering standards — sweep prose comments out of the diff, check it against docs/standards.md conventions, re-verify the eight hard security rules, and write findings to quality-audit.md. Use for /validate, or before declaring a feature done.
---

# Validate

Audits **the change**, not the repo. Comments get fixed; conventions and
security get reported. Findings go to `quality-audit.md` (gitignored working
record).

## Scope

```sh
git status --porcelain
git diff --stat main...HEAD
git diff --stat
```

Whole change by default: `main...HEAD` + working tree + untracked.
`/validate <path|glob>` narrows; `/validate staged` uses `--cached`. Never
audit untouched files — say so instead of padding the report.

## Pass 1 — prose comments (fix)

```sh
git diff -U0 main...HEAD -- src e2e tests scripts | grep -nE '^\+.*(//|/\*|\*/|<!--|#)'
git diff -U0 -- src e2e tests scripts | grep -nE '^\+.*(//|/\*|\*/|<!--|#)'
```

Untracked files have no diff — read them whole.

**Delete or shrink** a comment that: narrates the next line · restates a name ·
runs past one line without a real "why" · describes an approach the code no
longer takes · is a block/wall header · re-sells the offline guarantee (code or
UI copy).

**Keep**, one terse line: a security invariant, a non-obvious gotcha, a "why not
the obvious thing". Needs two lines? The code needs better names — file that as
a finding instead.

Apply directly, then `npx prettier --write` on **touched files only**, never
repo-wide `npm run format`. Pre-existing headers in `scripts/` and
`eslint.config.mjs` are out of scope unless this change touched them.

## Pass 2 — conventions (report)

Only what the change touches. Read `docs/standards.md` before calling a rule
violated.

**Structure**

- `.vue` ≤ 250 / template ≤ 120 / script ≤ 100; CSS `src`-linked, never inline
- `utils/` imports no Vue/stores/components; `composables/` imports no component
- `complexity` ≤ 10, `max-depth` ≤ 3, `max-params` ≤ 4
- new format → `adapters/`, never a special case in `DiffViewer`
- new modal → `BaseDialog` + `width` prop; new tool → `utils/tools.js` +
  `Tool*.vue`
- boundary objects → typedef in `types.js` + `shaped()` validator
- new shortcut → **both** `src/main/index.js` and `MenuBar.vue`; `CmdOrCtrl` in
  accelerators, `MOD` in labels
- main-process logic split so the testable core has no Electron import

**Visual** — only if `.vue`, `components/styles/` or `styles/` changed

- icons from `<AppIcon>` / `icons.js`; a standalone Unicode glyph is a finding,
  glyphs as prose are fine
- control heights via `.btn` / `.btn-sm` / `.btn-icon` / `.ql-kbd`, never
  padding + font-size
- strips carry `.band`, shared rows `.band-row`; no faked alignment via padding
- surfaces use depth roles + `--shadow-*`, never hand-rolled `rgba()`
- a class two components need belongs in `ui.css`
- **all 14 themes**, values parsed from `themes.css`, never guessed. 7 are
  light-ground; `contrast` `#111111` and `beacon` `#e0e0e0` carry hard keylines;
  `matrix`/`nyan`/`neon` halo any accent glow. One-theme validation is an
  unfinished change — say so.

**Tests**

- a fix with no test is a finding; the remedy is to write it, watch it fail
  against the reverted fix, restore
- test lives in the directory mirroring its subject
- event logic pulled into `composables/` and tested there; layout invariants
  encoded as a shared class/token and checked in Docker or e2e
- behaviour change in `sealing.js`, `vaultCrypt.js`, a store or an adapter →
  test in the same change; crypto also needs tamper / wrong-key / expiry
- coverage floors are a ratchet; one lowered to green a run is a finding

## Pass 3 — security (report)

Read the source at each call site; never infer from filenames.

1. **Offline** — no network call; kill switch, CSP, `sandbox`,
   `contextIsolation`, deny-all permissions, `will-navigate` intact in **both**
   windows (`security.js`, `window.js`, `quickLook.js`)
2. **Dependencies** — network audit + `npm audit` + pinned `allowScripts` entry
3. **Renderer/main** — no Node/Electron import in `src/renderer/`
4. **Keys never cross IPC**
5. **Crypto** — audience bound in the signature *and* both AAD layers;
   per-recipient wrap bound by `format ‖ fp ‖ audience`; retired keys
   decrypt-only; rotation advisory, predecessor key from the local trust store;
   TTL ≤ 1 week both sides (`MAX_TTL_MS` / `MAX_KEEP_HOURS` in step)
6. **Untrusted input** — size caps, shape validation, recomputed fingerprints
7. **`shell.openExternal`** — still two call sites, both confirming, both
   validated in main (`linkPolicy.js`); URL snippets still dropped from bundles
8. **No injection sinks** — no `v-html` / `eval` / `new Function` / `innerHTML`

```sh
grep -rnE "v-html|innerHTML|new Function|eval\(|openExternal|fetch\(|XMLHttpRequest" src/
grep -rnE "from '(electron|node:|fs|path|crypto|child_process)'" src/renderer/
```

Grep starts the check, it doesn't finish it. Rules found sound go in **Verified
clean** — that list stops the next run re-treading them.

## Pass 4 — gate

```sh
npm run check
```

Report the real result; a failure is the headline finding, output quoted, never
"should pass". For UI changes, note whether it was seen running (Docker /
`make e2e`) — unverified visual work is a finding, not a footnote.

## Pass 5 — quality-audit.md

Read the existing file first; it is cumulative.

- **Prepend** `## Run — <YYYY-MM-DD> · <branch>`
- Carry unresolved findings forward unchanged
- Collapse earlier resolved ones to `Closed in <date>: <n> findings`; **merge**
  their Verified clean list, never overwrite
- Never delete a finding to make the file look better

Each finding: what is wrong · `file:line` · the concrete failure, not a
category · the fix · how it is guarded. Severity order — data loss / security,
behaviour, lower priority. Close with which passes ran clean, what
`npm run check` returned, and anything left unaudited.

## Fixes

Comments are swept in place. Everything else is reported and left alone unless
asked — most findings have more than one right fix, and picking one silently is
worse than naming the choice. If asked, a bug fix still starts with the failing
test.
