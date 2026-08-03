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
- **Status is the truth**, and each value means one specific thing:

  | status        | what it asserts                                                                                                                                                               |
  | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `draft`       | Written, not agreed. No branch, no code. A draft presented and not answered stays a draft.                                                                                    |
  | `approved`    | The plan is agreed and the branch may be cut. Nothing is built yet.                                                                                                           |
  | `in-progress` | Work has started. Any step unticked, any Docs-impact "yes" undone, or any Validation line unchecked means it is still this.                                                   |
  | `shipped`     | **Ready for a human to review**: every step ticked, every Docs-impact "yes" done, every Validation line answered with a fact, and the PR open with the agent review resolved. |

  `shipped` is about the work being _finished and reviewable_ — not about the PR
  being merged. Merging is the human's decision, and a spec that waits for it
  would sit in `in-progress` describing work that is actually complete.

  Nothing may be marked `shipped` with a step outstanding. If one point genuinely
  cannot be done, it is not a footnote: say so on the line itself, in the plan,
  with the reason — an unmeasurable token figure and a deferred capture are both
  legitimate, silence about them is not.

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

### The review identity

GitHub refuses **Request changes** on your own pull request, so a reviewer that
shares the author's account can only ever leave a comment — the review stops
being a gate and becomes a suggestion. Reviews therefore go through:

```sh
node scripts/pr-review.mjs <pr> --event REQUEST_CHANGES --body-file review.md
```

It resolves a reviewer in this order, and refuses to pretend: if the identity it
finds is the PR author, or none is configured, it says so on stderr and
downgrades to a comment rather than failing at the API.

| variable               | what it is                                         |
| ---------------------- | -------------------------------------------------- |
| `DIFFBRO_REVIEW_TOKEN` | a PAT or App installation token for the reviewer   |
| `DIFFBRO_REVIEW_USER`  | a second account already added via `gh auth login` |

Setting one up is a one-time web step, and there are two shapes:

- **A GitHub App you own** — no second email, tokens expire hourly, permissions
  scoped to `Pull requests: read & write`. An installation token cannot be copied
  from the UI, so `scripts/review-token.mjs` mints one from the App ID and the
  downloaded `.pem`:

  ```sh
  export DIFFBRO_REVIEW_APP_ID=4467218   # diff-bro-reviewer
  export DIFFBRO_REVIEW_KEY=~/.config/diffbro/reviewer.pem
  export DIFFBRO_REVIEW_TOKEN=$(node scripts/review-token.mjs)
  ```

  The token lasts an hour; re-run the last line when it expires.

- **A machine account** — simpler: a second GitHub account added as a
  collaborator, `gh auth login` as it, then `DIFFBRO_REVIEW_USER=<name>`.

Never commit either. The token belongs in the shell environment or a secret
store, not in this repo.
