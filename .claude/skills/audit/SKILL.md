---
name: audit
description: Pre-ship gate for a branch or PR — two subagents in parallel, one reading the diff against docs/standards.md and the eight hard security rules, one driving the real app for regressions and broken flows. Reports ranked findings; does not fix. Use for /audit, or before opening a PR or cutting a release.
---

# Audit

A **gate**, not a cleanup. `/audit` reports; `/validate` fixes. Running `/audit`
and shipping past a red finding is the failure this skill exists to prevent.

Two agents, launched in **one message** so they run in parallel. The split is
absolute:

- **Reviewer READS.** Diff, source, config. Runs nothing.
- **QA RUNS.** Builds, tests, launches the app. Reads only to explain a failure.

No overlap means no duplicated work and no two-agents-disagree report.

## 1. Scope

```sh
git branch --show-current
git diff --stat main...HEAD
git status --porcelain
```

`/audit` → current branch vs `main` + working tree + untracked.
`/audit <PR#>` → `gh pr diff <PR#>`, and say which PR in the report.
`/audit <path|glob>` → narrows both agents.

Empty diff → stop and say so. Never audit untouched files.

## 2. Launch both

Both `subagent_type: general-purpose`, both in the same message. Each starts
cold — the briefs below are self-contained on purpose. Paste the resolved scope
into each.

Wait for both. **Never write the report from one agent's findings while the
other is still running, and never predict what it will say.**

### Reviewer brief

> Review `<scope>` in the DiffBro repo (Electron + electron-vite + Vue 3 + Pinia
> + Monaco, offline-only desktop diff viewer). Read `docs/standards.md` first —
> it is the authority. **Read source at every call site; never infer from a
> filename, and never report a grep hit as a finding without opening the file.**
> Run nothing: a second agent owns execution.
>
> **The eight hard security rules** (docs/standards.md) — re-verify each one the
> diff could touch:
>
> 1. Offline guarantee — no network call anywhere; kill switch, CSP,
>    `sandbox: true`, `contextIsolation`, deny-all permissions and
>    `will-navigate` intact in **both** windows (`security.js`, `window.js`,
>    `quickLook.js`). Note that `installNetworkKillSwitch` filters Chromium
>    traffic only — a main-process socket would be invisible to it, so check for
>    one directly.
> 2. New dependency → network audit + `npm audit` + version-pinned `allowScripts`
>    entry. Flag any new production dependency.
> 3. Renderer never imports Node or Electron.
> 4. Keys never cross IPC.
> 5. Crypto invariants — audience bound in the signature **and** both AAD layers;
>    per-recipient wrap bound by `format ‖ fp ‖ audience`; retired keys
>    decrypt-only; rotation advisory with the predecessor key from the local
>    trust store; TTL ≤ 1 week with `MAX_TTL_MS` / `MAX_KEEP_HOURS` in step.
> 6. Untrusted input — size caps, shape validation, recomputed fingerprints.
> 7. Sandbox exits — `shell.openExternal` call sites still confirm and validate
>    in main (`linkPolicy.js`); `showItemInFolder` / `openPath` paths still
>    computed in main; `clipboard:writeFile` still takes bytes and a name, never
>    a path; URL snippets still dropped from bundles.
> 8. No `v-html` / `eval` / `new Function` / `innerHTML`.
>
> **Conventions** — only what the diff touches:
>
> - `.vue` ≤ 250 lines / template ≤ 120 / script ≤ 100; CSS `src`-linked
> - `src/**/*.js` ≤ 250 lines, functions ≤ 60, complexity ≤ 10, depth ≤ 3,
>   params ≤ 4
> - `utils/` pure — no Vue, stores or components, and exports key IDs rather
>   than calling `t()`; `composables/` imports no component
> - feature slices import only another slice's `index.js`; core imports no slice
> - anything triggerable is a row in `utils/commands.js`, not a core action
> - new format → `adapters/`; new modal → `BaseDialog` + `width`; new tool →
>   `utils/tools.js` + `Tool*.vue`
> - new shortcut → **both** `src/main/index.js` and `MenuBar.vue`
> - icons from `<AppIcon>`; a standalone Unicode glyph is a finding
> - control heights from `.btn` / `.btn-sm` / `.btn-icon` / `.ql-kbd`, never
>   padding + font-size; strips carry `.band`
> - depth roles + `--shadow-*`, never a hand-rolled `rgba()`
> - user-facing text in `src/shared/i18n/en.json`; a sentence with markup is one
>   `<i18n-t>` message; syntax examples are not copy
> - prose comments are findings — narration, restatement, walls, or re-selling
>   the offline guarantee in code or UI copy
>
> **Ratchets** — a lowered floor or a widened allowance is a finding in itself:
> `scripts/lib/legacySize.mjs`, `scripts/structure-baseline.json`,
> `scripts/lib/installWarnings.mjs`, the `vitest.config.mjs` coverage floors,
> `check:rawtext` held at 0.
>
> **Tests** — a bug fix with no failing-first test is a finding. Behaviour change
> in `sealing.js`, `vaultCrypt.js`, a store or an adapter needs a test in the
> same change; crypto also needs tamper / wrong-key / expiry.
>
> Report each finding as: what is wrong · `file:line` · the concrete failure a
> user or attacker would hit, not a category · the fix. Rank data-loss and
> security first. Say explicitly which rules you verified clean — that list stops
> the next run re-treading them. If the diff touches no UI, say so rather than
> padding with visual checks.

### QA brief

> Functional sweep of the DiffBro app (Electron desktop diff viewer) for
> `<scope>`. You own everything that executes. Report what actually happened,
> with output quoted — never "should pass".
>
> **Gate first:**
>
> ```sh
> npm run check    # lint + style tokens + theme depth + tests at coverage floors
> ```
>
> A failure here is the headline finding. Quote it and keep going — later steps
> still produce useful signal.
>
> **Then E2E. Platform decides how:**
>
> On **macOS host** (faster, and the only way to run the macOS-gated specs):
>
> ```sh
> npm run build
> env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/<spec>
> ```
>
> `env -u ELECTRON_RUN_AS_NODE` is **not optional** — this shell exports it and
> Electron then silently runs as plain Node. The tell is `electron --version`
> printing a Node version, or `Process failed to launch!`. Add `E2E_WORKERS=1`
> for more than one spec: the display pool is X11-only and a second worker off
> Linux throws rather than share the system clipboard.
>
> On **Linux / for the full suite**: `make e2e` (builds and drives inside the
> running container). `make up` starts it; noVNC at
> <http://localhost:6080/vnc.html>.
>
> A failing run's artifacts are copied to a timestamped `e2e-failures/` folder —
> Playwright wipes `test-results/` at the start of the next run. Open one with
> `npx playwright show-trace e2e-failures/<stamp>/<test>/trace.zip`. **Never
> delete `test-results/` while chasing an intermittent.**
>
> A spec that skips off its platform proves nothing. `test.skip(…'darwin')`
> specs are unverified on Linux — list them as unverified rather than as passing.
>
> **Pick the specs by what the diff touches**, then add the flows downstream of
> it. 90 specs live in `e2e/`; the functional areas are: diff core and viewers ·
> tabs and session restore · snippets · saved-diff vault · sealed sharing and
> trusted keys · config backup/restore · Quick Look · CLI · text tools ·
> clipboard · image export · themes and appearance · i18n and locale. Run the
> touched areas fully, plus `smoke.spec.mjs` always.
>
> **If the diff touches `.vue`, `components/styles/` or `styles/`:**
>
> ```sh
> make theme-sweep    # all 14 themes, computed colours off the live DOM
> ```
>
> A new surface needs an entry in `SURFACES` — its absence is a finding. Seven of
> the 14 themes are light-ground; `contrast` and `beacon` carry hard keylines;
> `matrix` / `nyan` / `neon` halo any accent glow.
>
> **Regression judgement, not just green ticks.** For each flow the diff could
> reach, state whether you exercised it and what you saw. A flow you could not
> reach is an unverified area — name it. Ranked by user impact: data loss first
> (a diff, snippet or key that cannot be read back), then broken flows, then
> visual defects.

## 3. Synthesise

Merge, de-duplicate, rank once across both. A finding both agents reached from
different directions is stronger, not duplicated — say so.

Report:

- **Ship / do not ship**, stated first, one line, with the reason.
- **Blocking** — data loss, security, a broken primary flow, `npm run check`
  red.
- **Should fix before merge** — convention breaks, missing tests, unverified UI.
- **Verified clean** — what each agent checked and found sound.
- **Unverified** — platform-skipped specs, flows not reachable, anything the
  agents could not exercise. An honest gap here is worth more than a clean
  report that hid it.

Every finding carries `file:line` and a concrete failure. A category name is not
a finding.

Close by naming what to hand to `/validate`. Do not fix anything here — a gate
that edits the thing it is measuring is no longer a gate.
