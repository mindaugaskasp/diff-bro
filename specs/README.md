# specs/

One directory per feature: `specs/YYYY-MM-DD-<description>/plan.md`.

```
specs/2026-08-02-tab-ui-redesign/plan.md
```

The date is the day the spec was created — it fixes chronology in `ls` order
and never changes, even when the work runs long or is picked up months later.

Committed on purpose. `quality-audit.md` is a gitignored scratchpad; a spec is
the record of _why_ the code looks the way it does, and is worth more six months
later than on the day it was written.

Written by `/implement` — drafts the plan, stops for approval, works the steps,
closes with `/validate`. Template: `.claude/skills/implement/plan-template.md`.

## Conventions

- **One spec, one branch**, created before the first edit:
  `feat/` · `fix/` · `improvement/` + the description, **without the date** —
  `specs/2026-08-02-tab-ui-redesign/` gives `improvement/tab-ui-redesign`. The
  prefix already carries the meaning a date would add, and dated branches read
  as stale long before they are. `fix/` needs a reproduction, `improvement/` is
  existing behaviour made better, `feat/` is a new capability. Specs share a
  branch only on _direct_ overlap — same files, same reason, or one cannot run
  without the other's unmerged work — and the reason goes in Decisions.
- **Description is kebab-case** and identical in the directory and the branch,
  so `ls -d specs/*-<description>` finds the spec without knowing its date.
- **Status is the truth:** `draft` → `approved` → `in-progress` → `shipped`.
  Never shipped with steps outstanding.
- **Decisions is append-only** — it stops settled questions being re-litigated.
- **A plan that diverged from the code is a bug in the plan.** Amend it; a stale
  spec is worse than none.
- Too small to plan needs no spec — but crypto, IPC, the adapter registry or any
  visual surface is never too small.

## Landing it

The branch is where the steps were ticked; the PR is where that becomes
reviewable — by a machine first, then by a person who is not reading it cold.

- **Finished work reaches `main` through a PR**, never a direct push. Finished
  means the plan's steps are ticked and `/validate` is clean — not that the code
  runs.
- **A code-review agent reviews the PR before a human does**, in detail, and
  leaves its findings as comments on the PR itself. A review that lives in a chat
  transcript is one nobody can find again.
- **Every comment is answered and resolved before a human is asked to look**, so
  what reaches them is a PR that has already been read, not one still carrying
  its first-pass questions.
