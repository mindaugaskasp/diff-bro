# Developer workflow — dependencies, revisions, and finishing the merge

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 13 / 13 — all three phases shipped |
| **Branch** | `feat/developer-workflow` |
| **Started** | 2026-08-09 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 |
| **Token baseline** | 2026-08-09T20:27:28Z |
| **Claude tokens used** | — |

Three findings from the developer-experience investigation, in one spec because
they share a thesis and a seam. Each is its own phase, landed in its own commits,
and each is independently shippable — if the spec stops after phase 1, phase 1 is
still a complete feature.

## Problem

DiffBro's differentiator is **compare meaning, not lines**: JSON/YAML/XML as data
(`structuralDiff.js`), workbooks as grids with a materiality tolerance, Mermaid as
one picture. That thesis has never been pointed at the three artifacts a developer
actually spends their day on.

**1 · A lockfile diff is unreadable.** `package-lock.json` in this very repo has
784 package entries. Bumping one dependency rewrites thousands of lines, and every
tool on the market renders that as text and gives up. Nothing tells the reader the
only thing they want to know: *which packages actually changed, which of them I
asked for, and which came along*.

**2 · The unit of work is wrong.** `diffbro compare` takes file PATHS only
(`cli.js:156`). A developer's unit of work is a change — a commit, a branch,
staged vs working tree — so using DiffBro on your own work means manufacturing two
files first. The tool cannot see the repo it is sitting in.

**3 · The app advertises a job it cannot finish.** `gitTool.js` registers DiffBro
as git's `difftool` **and** `mergetool`, and its own settings copy admits the
consequence: *"Diff Bro doesn't write the merged file, so git still asks you
whether the merge worked."* `registerArgs` sets `trustExitCode=false` to keep that
honest. So `git mergetool` opens DiffBro, you read the conflict, and then resolve
it somewhere else — a context switch at the worst possible moment, caused by the
app having volunteered for the job.

## Solution

Three phases, in ascending order of what they cost and what they risk.

**Phase 1 — dependencies as dependencies.** A lockfile parser per ecosystem
(`utils/lockfile/`) normalising to one shape, a comparison that classifies each
change (added · removed · bumped · downgraded, direct vs transitive, and the
semver step), and a viewer. It is a **semantic kind** beside tree/grid/diagram —
`semanticKind()` gains `'deps'` — because a lockfile IS json/yaml, so it must not
fight `resolveAdapter`. Zero new dependencies: `yaml` is already in the tree, and
yarn v1/`go.sum` are line formats.

**Phase 2 — git-native comparison, read-only.** A fenced main-process
`gitRepo.js` that resolves a revision and reads a blob (`git show <rev>:<path>`),
plus the CLI grammar for it. No writes, no new dependency, no socket.

**Phase 3 — finishing the mergetool.** A three-way conflict model, a resolution
UI, and — the line this crosses — main writing the `$MERGED` path git handed it,
then exiting 0 under `trustExitCode=true`.

| option | why not |
|---|---|
| a lockfile adapter in `resolveAdapter` | a lockfile IS JSON; `textAdapter`/structure already claim it. Making it a semantic KIND keeps the text and structure views one toggle away, which is what a reader wants when the summary is not enough |
| parse lockfiles with an ecosystem library (`@npmcli/arborist`, …) | rule 2. Arborist alone drags a tree far larger than the eleven production dependencies this app has, and it wants the network. The formats are stable and documented; reading them is a parser, not a package manager |
| TOML lockfiles (`Cargo.lock`, `poetry.lock`) in phase 1 | TOML needs a parser this repo does not have, and a hand-rolled one is a new class of bug for two ecosystems. Deferred with the reason recorded, not silently skipped |
| git via `isomorphic-git` | a production dependency reimplementing what is already installed, to avoid a subprocess the app already spawns (`gitTool.js` `execFile`) |
| let the renderer name the git revision and path | rule 3/7. Main owns the repo root, the argv and the fence; the renderer names a revision STRING and never a command |
| three-way merge as a full editor | out. The merged pane accepts a CHOICE per conflict (take left / right / both / neither), not free typing — that is what `git mergetool` needs and it keeps DiffBro a viewer with one deliberate write |

## Scope

**In:**

- **Phase 1** — `utils/lockfile/` (npm v1/v2/v3, pnpm, yarn v1, `go.sum`),
  `lockDiff.js`, `canCompareDeps` + `semanticKind() === 'deps'`, a viewer, i18n,
  unit + e2e, docs
- **Phase 2** — `src/main/gitRepo.js` (fenced), `git:` IPC, CLI revision grammar,
  a UI entry point, docs
- **Phase 3** — `utils/mergeConflicts.js`, the resolution UI, `mergetool`
  registration writing `$MERGED`, `trustExitCode=true`, docs

**Out:** *(recorded, not drifted into)*

- TOML lockfiles — phase 1 ships four ecosystems, `Cargo.lock`/`poetry.lock` need
  a TOML reader and get their own decision
- a package REGISTRY lookup of any kind (latest version, advisories, licences
  beyond what the lockfile itself states) — rule 1, and no amount of usefulness
  changes that
- staging, committing, or any git WRITE in phase 2 — reading blobs only
- free-text editing of the merged file; DiffBro resolves by choosing hunks
- `git log` browsing / a commit picker UI — phase 2 takes a revision, it does not
  become a git client

## Design

Phases 1 and 3 add surfaces; phase 2 adds one field and a menu item.

The dependency view is a **band + rows**, reusing what already exists: the
`.status-band` for the roll-up, `.btn`/`.btn-sm` for its controls, and the same
add/remove/change ink the grid and structure views use (`--success-text`,
`--danger-border`, `--warning-bg` at the same `color-mix` steps). A row's semver
step is a `--chip-h` chip, `.btn-count`-style — the theme's own ink at a fixed
percentage, never `--accent` as a fill under a label.

The merge view is the existing two-pane frame with a third, read-only result
pane; each conflict is a band carrying four `.btn-sm` choices. No new depth role,
no new shadow level.

### Theme verdict — all 20

Parsed from `styles/themes.css`. Every colour below is already load-bearing
somewhere in the app, so the verdict is about what the new markup composes.

| theme | ground (`--bg`) | verdict | note |
|---|---|---|---|
| light | `#ffffff` (canvas inverted) | ok | rows sit on `--bg-raised`, the floating-card role |
| dark | `#0d1117` | ok | |
| solar | `#fffdf6` | ok | |
| neon | `#090d18` | ok | accent `#22d3ee` on the focus ring only |
| nord | `#2e3440` | ok | secondary text is `--text-hint`, not `--text-dim` (see ui.css) |
| sepia | `#e9dcbe` | ok | as nord |
| dim | `#1b1917` | ok | |
| beacon | `#000000` | ok | hard keyline `#e0e0e0` — nothing here removes a border |
| meridian | `#f5f7f4` | ok | |
| linen | `#faf7f0` | ok | |
| bloom | `#f9f4f5` | ok | |
| nyan | `#160a20` | ok | accent `#ff2ecb` — no glow, no accent fill under a label |
| matrix | `#020a04` | ok | accent `#00ff41` — same |
| contrast | `#ffffff` | ok | hard keyline `#111111`, kept |
| volcano | `#000000` | ok | border `#ffc9a4` |
| amber | `#0f0a02` | ok | |
| tide | `#0b1a1e` | ok | |
| ember | `#1a1013` | ok | |
| graphite | `#161616` | ok | achromatic; status ink is the semantic tokens, not hues |
| vector | `#ffffff` | ok | |

Read off real frames per phase before that phase's commits close, the way the
row-hover mark was — a table alone is not the check.

## Security rules touched

Phase 1 touches none: pure parsing of a file already read, rendered through Vue
text interpolation. Rule 6 still applies to the parse — a lockfile is untrusted
input, so entry counts are capped and a malformed file degrades to the text view
rather than throwing.

**Phase 2 and 3 are the ones that need care.**

- **Rule 1 (offline) holds.** `git show` opens no socket. It is the same class of
  sandbox exit as `gitTool.js`'s existing `execFile('git', …)` and the Windows
  clipboard `powershell.exe` call — a subprocess, not a network client. Any git
  subcommand that can reach the network (`fetch`, `pull`, `clone`, `ls-remote`)
  is refused by an allowlist, not by convention.
- **Rule 7 (leaving the sandbox is fenced in main).** The fence, stated up front:
  fixed argv through `execFile`, **never a shell**; the repo root computed in
  MAIN via `git rev-parse --show-toplevel` and never accepted from the renderer;
  `--` before every path; and the invocation hardened against a hostile
  repository — `-c core.fsmonitor=` and `-c core.hooksPath=/dev/null`, with
  `GIT_CONFIG_NOSYSTEM=1` and a cleared `GIT_*` environment. A repo you cloned is
  untrusted input, and repo-local config has been an execution vector before.
  This is the phase-2 acceptance criterion, not a nicety.
- **Rule 6.** A revision string from the renderer is validated against a
  conservative pattern before it reaches argv, and never begins with `-`.
- **The write in phase 3 is the deliberate line-crossing.** It is narrow: main
  writes exactly the `$MERGED` path git passed on the command line, held in main
  from launch, never round-tripped through the renderer, and only on an explicit
  user action. The renderer sends the resolved TEXT, not a path — the same shape
  as `clipboard:writeFile`, which takes bytes and a display name and refuses to
  let the renderer name a file.

## Test plan

- **unit** — `tests/renderer/utils/lockfile/*.test.js`: each parser against a real
  fixture of its format, including a malformed one; `lockDiff.test.js`: added,
  removed, bumped, downgraded, direct vs transitive, and a bump that changes only
  `resolved`
- **unit** — `tests/main/gitRepo.test.js`: the argv builder (the fence is a pure
  function, so it is unit-testable without a repo), revision validation, and the
  refusal of every network subcommand
- **unit** — `tests/renderer/utils/mergeConflicts.test.js`: conflict-region
  parsing, each of the four resolutions, a file with no conflicts, nested markers
- **e2e** — `e2e/deps.spec.mjs`: two real lockfiles open as a dependency summary
  and the text view is one toggle away; `e2e/git-compare.spec.mjs`: a temp repo
  with two commits compared by revision; `e2e/merge-resolve.spec.mjs`: a real
  `git mergetool` invocation resolved and written
- **red → green** — every fix in this spec, recorded with its failure
- **seed fixtures** — `seed-local.mjs` gains a `package-lock` before/after pair,
  so the dependency view is openable by hand on the host

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | a Dependencies row, the git entry point, and the Terminal row's grammar; the mergetool sentence stops apologising |
| `docs/screenshots/*.png` | **yes, phase 1 and 3** | a new viewer is a new frame; recapture in the container |
| `docs/roadmap.md` | **yes** | a Developer workflow track; "Comparing more" loses three-way merge to it |
| `docs/brand/roadmap.svg` | **yes** | same move, hand-authored |
| `docs/security.md` | **yes, phase 2** | the git subprocess fence belongs beside the other sandbox exits |
| `docs/ipc-security.md` | **yes, phase 2/3** | two new IPC surfaces |
| `docs/glossary.md` | **yes** | lockfile, direct vs transitive, three-way merge |

## Implementation plan

**Phase 1 — dependencies**

- [x] 1. `utils/lockfile/` — npm v1/v2/v3, pnpm, yarn v1, `go.sum` → one shape
- [x] 2. `utils/lockDiff.js` — classify each change; direct vs transitive
- [x] 3. `canCompareDeps`, `semanticKind() === 'deps'`, `shouldOpenSemantic`
- [x] 4. The viewer + its stylesheet + i18n
- [x] 5. Seed pair, e2e, README/glossary

**Phase 2 — git-native comparison**

- [x] 6. `src/main/gitRepo.js` — the fence, argv builders, revision validation
- [x] 7. IPC + CLI grammar, wired end to end through `parseCompare` and the launch
- [x] 8. `docs/security.md` / `docs/ipc-security.md` + README
- [x] 9. e2e against a temp repo

**Phase 3 — finishing the merge**

- [x] 10. `utils/mergeConflicts.js` — regions and the four resolutions
- [x] 11. The merge view
- [x] 12. `mergetool` registration writing `$MERGED`, `trustExitCode=true`
- [x] 13. e2e through a real `git mergetool`, docs, roadmap + SVG

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-09 | all three findings in ONE spec, three phases, each in its own commits | the user asked for it; they share the "compare meaning" thesis and the semantic-kind seam, and each is independently shippable | three specs |
| 2026-08-09 | order is lockfiles → git read → merge write | ascending risk. Phase 1 strains no rule, phase 2 opens a fenced subprocess, phase 3 crosses the never-writes line. Each phase's evidence informs the next | merge first, which is the loudest gap but the riskiest start |
| 2026-08-09 | **phase 3 crosses "DiffBro never writes files", on the user's instruction** | `docs/roadmap.md` parks three-way merge as "a decision, not code". The user made the decision on 2026-08-09. The argument that carries it: the app ALREADY registered as `git mergetool`, so it already took the job | keeping the viewer pure and de-registering as a mergetool instead — the honest alternative, not chosen |
| 2026-08-09 | dependencies are a semantic KIND, not an adapter | a lockfile is JSON; making it a kind keeps text and structure one toggle away | a `resolveAdapter` entry, which would have to out-rank `textAdapter` and hide the raw file |
| 2026-08-09 | four ecosystems in phase 1, TOML deferred | no new dependency, and the four cover npm/pnpm/yarn/go | hand-rolling TOML |

## Validation

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — real output, per phase
- [ ] every phase seen running before its commits close
- [ ] every Docs-impact "yes" done
- [ ] token usage measured

### Token usage

| category | tokens |
|---|---:|
| input | |
| output | |
| cache write | |
| cache read | |
| **total** | |

**Outcome:**
