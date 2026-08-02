# <Feature title>

| | |
|---|---|
| **Status** | draft · approved · in-progress · shipped |
| **Progress** | 0 / N steps |
| **Branch** | `feat/` · `fix/` · `improvement/` + `<slug>` |
| **Started** | YYYY-MM-DD |
| **Finished** | YYYY-MM-DD |
| **Bugs found and fixed this iteration** | 0 / N |
| **Token baseline** | ISO timestamp, written when the build starts |
| **Claude tokens used** | N — measured, never estimated |

## Problem

What breaks, for whom, when — with evidence (`file:line`, a repro, a failing
case). Not "the tab bar could be nicer".

## Solution

The approach, then what was rejected.

| option | why not |
|---|---|
| | |

## Scope

**In:**

**Out:** *(scope creep as a recorded decision, not a drift)*

## Design

Token-driven only — depth roles (`--bg-canvas` / `--bg` / `--bg-elevated` /
`--bg-raised`), `--shadow-*`, `--control-h` / `--control-h-sm` / `--chip-h`,
`.band` / `.band-row`, `<AppIcon>`. Name the tokens; a literal colour,
font-size or radius fails `npm run check:styles`.

### Theme verdict — all 14

Values parsed from `styles/themes.css`, never guessed. Ground is `--bg`, not
the name — `beacon` reads light but is `#000000`. Omit this table when there is
no visual surface; never leave it blank.

| theme | ground | verdict | note |
|---|---|---|---|
| light | light | | floating-canvas inversion |
| dark | dark | | |
| solar | light | | |
| neon | dark | | accent `#22d3ee` |
| nord | dark | | |
| sepia | light | | |
| dim | dark | | |
| beacon | dark | | hard keyline `#e0e0e0` on `#000000` |
| meridian | light | | |
| linen | light | | |
| bloom | light | | |
| nyan | dark | | accent `#ff2ecb` |
| matrix | dark | | accent `#00ff41` |
| contrast | light | | hard keyline `#111111` |

## Security rules touched

Which of the eight hard rules this comes near, and why it stays inside them.
"None — no IPC, no fs, no crypto, no new dependency, no external link" is valid
and common; say it rather than deleting the section.

## Test plan

Written before the code.

- **unit** — `tests/<mirrored path>.test.js`: what it asserts
- **e2e** — `e2e/<name>.spec.mjs`: the user path
- **red → green** — each bug's test watched failing first; record the failure
- **seed fixtures** — which `scripts/seed-local.mjs` `FILES` / `TEXT_FILES`
  entries change. Required for a new format or changed data shape:
  `make local-seed` is the only way it is opened by hand on the host Mac. Add a
  before/after pair, keep the `seed` tag, confirm `local-seed-clean` still
  removes exactly what it wrote.

## Docs impact

Every row gets a verdict **and a reason** — "no" needs one as much as "yes".
Each yes becomes a numbered step below.

| surface | needed? | what changes |
|---|---|---|
| `README.md` | | architecture or feature-status change |
| `docs/screenshots/*.png` | | any visible change to a captured state |
| `docs/roadmap.md` | | item moves open → done, or a new track — mermaid + terse Done./Open. bullets, no prose |
| `docs/brand/roadmap.svg` | | same move — hand-authored, edit alongside |
| `docs/*.md` | | security.md · ipc-security.md · glossary · standards.md |

Screenshots: `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`,
`spreadsheet-diff`. `make screenshots` (or `SHOTS="…"`) runs **in the
container** — needs Xvfb; `_electron` cannot launch Electron on the macOS host.
A restyled control stales every frame containing it, and the README `alt` text
changes with the image.

## Implementation plan

- [ ] 1.
- [ ] 2.
- [ ] 3.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|

## Validation

Recorded as fact, not intention.

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] UI seen running (Docker / `make e2e`), if it has a surface
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `make local-seed` opens the new format on the host; `local-seed-clean`
      removes it
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category | tokens |
|---|---:|
| input | |
| output | |
| cache write | |
| cache read | |
| **total** | |

Cache read dominates: it is context re-sent each turn at a fraction of fresh
input, so the total is tokens *processed*, not a cost. `output` and
`cache write` track work produced.

**Outcome:**
