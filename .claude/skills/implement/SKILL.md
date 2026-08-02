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

Ask only where two readings mean materially different work; log routine calls in
Decisions.

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
