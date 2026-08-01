# DiffBro — project instructions

Offline-only desktop diff viewer. Electron + electron-vite + Vue 3 + Pinia +
Monaco.

The engineering standards this repo runs on — commands, the hard security
rules, coding standards, testing rules and workflow — live in
**[docs/standards.md](docs/standards.md)**. They apply to every change; the
file below is imported into context automatically.

@docs/standards.md

## Working here

- **Never `git commit` unless explicitly asked.**
- **Run `npm run check` before declaring any task done** — lint + style-token
  guard + theme-depth guard + tests against the coverage floors.
- Three standards get skipped most often, so they are restated here:
  - **A bug gets a failing test first.** Red → green, or the test guards
    nothing.
  - **The offline guarantee, the renderer/main split and the crypto
    invariants are non-negotiable.** See the hard security rules.
  - **A UI change is checked against all 14 themes** before it is proposed,
    not after it is built.
  - prose / overly verbose comments must be removed / trimmed before stating feature is done. Code must be self describing.
