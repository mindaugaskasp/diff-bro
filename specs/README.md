# specs/

One directory per feature: `specs/<feature-slug>/plan.md`.

Committed on purpose. `quality-audit.md` is a gitignored scratchpad; a spec is
the record of *why* the code looks the way it does, and is worth more six months
later than on the day it was written.

Written by `/implement` — drafts the plan, stops for approval, works the steps,
closes with `/validate`. Template: `.claude/skills/implement/plan-template.md`.

## Conventions

- **One spec, one branch**, created before the first edit:
  `feat/` · `fix/` · `improvement/` + the slug →
  `specs/tab-ui-redesign/` gives `improvement/tab-ui-redesign`. `fix/` needs a
  reproduction, `improvement/` is existing behaviour made better, `feat/` is a
  new capability. Specs share a branch only on *direct* overlap — same files,
  same reason, or one cannot run without the other's unmerged work — and the
  reason goes in Decisions.
- **Slug is kebab-case** and matches the branch's short description.
- **Status is the truth:** `draft` → `approved` → `in-progress` → `shipped`.
  Never shipped with steps outstanding.
- **Decisions is append-only** — it stops settled questions being re-litigated.
- **A plan that diverged from the code is a bug in the plan.** Amend it; a stale
  spec is worse than none.
- Too small to plan needs no spec — but crypto, IPC, the adapter registry or any
  visual surface is never too small.
