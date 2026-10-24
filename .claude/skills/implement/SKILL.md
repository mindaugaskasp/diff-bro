---
name: implement
description: Plan and build a feature in DiffBro under a tracked spec — specs/YYYY-MM-DD-<slug>/plan.md holding the problem, the solution, and a progress-tracked plan bound to this repo's standards, including which docs go stale. Stops for approval before code, branches, closes with /validate. Use for /implement, or any feature or fix large enough to need a plan.
---

# Implement

`specs/` is committed. The plan is the artifact `/validate` later audits against.

## 1. Resolve

`/implement <name>` → kebab-case slug. No argument: derive one, say which.

Specs are dated: `specs/YYYY-MM-DD-<slug>/plan.md`, the date being the day the
spec was created and never touched again. The branch drops it
(`improvement/<slug>`) — the prefix already carries the meaning there.

Look up by slug, not by guessing a date:

```sh
ls -d specs/*-<slug> 2>/dev/null
```

Then, on the plan it finds:

| state | do |
|---|---|
| missing | write it — step 2 |
| `draft` | present again; it was never approved |
| `approved` / `in-progress` | resume from the first unchecked step, no re-approval |
| `shipped` | ask before reopening; new scope is usually a new slug |

Read the whole plan first — Decisions exists so settled questions stay settled.

## 2. Research

- the source it touches, and the tests already covering it
- visual work: parse real values from `styles/themes.css` — never guess a colour
- `docs/standards.md` for the rules governing this area
- existing adapter / composable / `ui.css` class — a second bespoke copy is this
  repo's recurring failure
- `README.md`, `docs/roadmap.md`, `docs/screenshots/` — what goes stale

**Grill the user before anything is drawn or written.** Ask about every open
detail — behaviour, edge cases, scope, copy, what is out — one question at a
time, each with a recommended answer (the `grilling` skill), until nothing is
left to guess. Record every answer in Decisions. Only then build the canvas or
write the plan.

### UI/UX work starts with a design artifact

Any change with a visible surface gets a **design canvas artifact** before the
plan is written. The canvas is the **primary source of truth**, and the spec
follows it, never the other way round.

1. Create it: `Artifact` quickstart, intent `design`, titled after the slug.
   - Artboards for the proposed states (at rest, hover, editing, empty,
     error: whichever the change has).
   - One "Today" artboard holding host screenshots of the current state.
   - Colours parsed from `themes.css` (light and dark at least, as a tweak),
     never guessed.
2. Iterate on the canvas with the user. Feedback changes the artboards first,
   then the spec.
3. Paste it into the plan's **Design** section:
   - the canvas link;
   - a table of each artboard and what it shows;
   - the layout rules and token mapping it fixes.

   Re-paste whenever the canvas changes. A spec whose Design section no longer
   matches the canvas is stale.

4. **Approve before you build.** Once the look is decided, add an **Approved
   design** page to the canvas.
   - It holds frozen copies of the chosen artboards only: the selected
     options applied, with no alternatives and no "Today".
   - A sticky lists the decisions.
   - It is the canvas's launch page.
   - Development does not start until that page exists and the user has
     signed it off. Later exploration happens on the other pages and never
     edits the approved copies; a change to the approved look means a new
     sign-off.

`/validate` and review hold the built UI against the **Approved design**
page. The spec text alone is not the reference.

## 3. Write the plan

Copy this skill's `plan-template.md` to `specs/$(date +%F)-<slug>/plan.md`. It
documents its own sections — fill **all** of them. `<Feature title>` or an
unfilled `| ... |` row means unfinished.

Three things the template assumes you know:

- **Theme table** — real parsed values. `contrast`/`beacon` carry hard keylines,
  `matrix`/`nyan`/`neon` halo any accent glow, 7 of 14 are light-ground. Drop the
  table only when there is no visual surface.
- **Seed data** — `seed-local.mjs` ships `.xlsx`/`.yaml`/`.xml`/`.json` and no
  `.csv`/`.tsv`. A format missing there is one nobody opens by hand on the Mac.
- **Docs impact** — every "yes" becomes a numbered step.

## 4. Stop

Present it and wait. No code, no branch. On approval: `Status: approved`.

## 5. Branch + baseline

One spec, one branch, created before the first edit.

**An approved design ships in slices, one PR per design change, as a stack
managed with [git-spice](https://abhinav.github.io/git-spice/).**
- Split the approved design into the smallest changes that each stand alone,
  each with its own failing tests first.
- **Stack them with git-spice** (`gs` is only a zsh alias, so scripts call
  `git-spice`):
  - once per clone: `git-spice repo init --trunk main --remote origin`, then
    `git-spice auth login` with the GitHub CLI method, which reuses `gh`;
  - each slice: `git-spice branch create <prefix>/<slug>` on top of the slice
    below it, so slice 1 sits on `main` and slice N on slice N−1;
  - publish: `git-spice stack submit --fill`. Every PR targets the slice
    below it, shows only its own change, and is reviewed as one PR.
- **Every slice is green on its own.** CI must pass on every runner for each
  PR in the stack, not only the top, and no slice leaves half-built UI behind
  it.
- **A fix found in a lower slice goes into that slice:**
  `git-spice branch checkout` it, commit, then `git-spice upstack restack`
  and `git-spice stack submit`. Never patch it from the top.
- **The stack releases as one unit.**
  `git-spice downstack merge --method squash --branch <top>` merges
  bottom-up, restacking and resubmitting what is above as it goes. Then
  `git-spice repo sync`, and tag once the whole stack is on `main`.
- List the slices in the plan's **Delivery** table: slice, branch, base, PR,
  status. Tick each one off on merge.
- The spec, canvas and process changes travel in the first slice. A slice
  never carries another slice's work, so each review stays one change.

| prefix | when |
|---|---|
| `fix/` | broken, with a reproduction |
| `improvement/` | existing behaviour made better |
| `feat/` | capability that did not exist |

`<short-desc>` is the slug → `improvement/tab-ui-redesign`.

```sh
git status --porcelain            # clean, or only this plan.md
git switch main && git switch -c <prefix>/<slug>
date -u +%Y-%m-%dT%H:%M:%SZ       # → Token baseline row
```

`git switch -c` carries uncommitted changes across. Unrelated work in the tree:
stop and ask — never stash or commit on the user's behalf.

Share a branch only on *direct* overlap — same files, same reason, or it cannot
run without that branch's unmerged work. "Adjacent" and "already here" do not
count; record a real overlap in Decisions.

Resuming: switch to the branch the header names. If it is gone, ask rather than
rebuild from a different base.

No baseline recorded → the token figure is "not measured". Never invent one.

## 6. Build

Tick each step, update **Progress**, append decisions as they are made.

- **failing test first** — red → green, or it guards nothing
- renderer never imports Node/Electron; keys never cross IPC
- `.vue` ≤ 250 / template ≤ 120 / script ≤ 100; CSS in `styles/<Name>.css`
- `utils/` stays pure; event logic → `composables/`, never inline in the SFC
- `<AppIcon>`, the control-height scale, `.band` on strips
- new format → adapter; modal → `BaseDialog`; tool → registry; shortcut → both
  `src/main/index.js` and `MenuBar.vue`
- `npx prettier --write` on touched files only

Docs steps run after the UI settles, before validation. Check regenerated PNGs —
a mis-seeded run yields a plausible wrong frame.

Amend the plan when a step turns out wrong and note why. Diverging from it
silently is what makes a spec worthless.

## 7. Validate

```sh
/validate
```

Fill **Validation** with real output, never an intention. Then the header —
**Finished**, **Bugs found and fixed**, and:

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

Reads Claude Code's own transcripts; covers every session that worked in this
repo inside the window. Paste its table, total into the header. Cache read
dominates, so the total is tokens *processed*, not a bill. The window is
wall-clock — if the session wandered onto other work, say so beside the number.

`Status: shipped` only when steps are ticked, validation is clean, and every
Docs-impact "yes" is done. Otherwise `in-progress` plus what is outstanding.

Never `git commit` unless explicitly asked.
