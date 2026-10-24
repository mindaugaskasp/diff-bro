# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/glossary.md`**: the project's vocabulary, grouped by area. This repo keeps it under `docs/`, not as a root `GLOSSARY.md`.
- **Recorded decisions**: the **Decisions** table in each `specs/*/plan.md` that touches the area you're about to work in, and `docs/standards.md` for the rules every change follows.
- **`docs/adr/`**: read it too if it ever exists. There is none today.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── docs/
│   ├── glossary.md
│   └── standards.md
├── specs/
│   └── YYYY-MM-DD-<slug>/plan.md   ← Decisions table per feature
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/glossary.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts a recorded decision (a spec's Decisions table, `docs/standards.md`, or an ADR), surface it explicitly rather than silently overriding:

> _Contradicts the 2026-08-04 email-sharing decision (no SMTP client), but worth reopening because…_
