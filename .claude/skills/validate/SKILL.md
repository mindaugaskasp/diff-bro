---
name: validate
description: Audit the current change against DiffBro's engineering standards — sweep prose comments out of the diff, check it against docs/standards.md conventions, re-verify the eight hard security rules, then FIX everything found and prune quality-audit.md to what is still wrong. Use for /validate, or before declaring a feature done.
---

# Validate

Audits **the change**, not the repo. **Everything found gets FIXED in this
change** — comments, conventions, security, the lot. `quality-audit.md` is the
working record of that, not a backlog: a finding written there is one being
fixed now. Minor is not a licence to ship; low severity describes impact, not
permission.

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
5. **Crypto** — audience bound in the signature _and_ both AAD layers;
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

Read the existing file first. It opens with a statement of its own purpose —
keep that, and keep to it.

- Write each finding down as you go, then **fix it**, then **prune the entry**.
- What remains at the end is what is still wrong. If that is not empty, the
  change is not done.
- Only two things may be left standing, and each must say which it is: something
  outside this repo's control (with the evidence), or something the **user**
  chose to defer (in their words, with the reason).
- Never delete a finding to make the file look better — delete it because it is
  fixed, and say where (`git log`, the spec) it went.

Each finding: what is wrong · `file:line` · the concrete failure, not a
category · the fix · how it is guarded. Severity order — data loss / security,
behaviour, lower priority. Close with which passes ran clean, what
`npm run check` returned, and anything left unaudited.

## Fixes

**Fix everything you find, in this change.** A bug fix starts with the failing
test — red, then green, every time.

Where a finding has more than one right fix, say which you took and why in the
audit entry before you prune it; that is the record, not a reason to defer. The
only findings that survive the run are the two exceptions in Pass 5, and a
"minor" or "cosmetic" label is neither of them.
