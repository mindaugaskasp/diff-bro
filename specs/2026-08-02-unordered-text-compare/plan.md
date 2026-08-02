# Compare text without its order

| | |
|---|---|
| **Status** | draft — needs the semantics decision below |
| **Progress** | 0 / 7 steps |
| **Branch** | TBD |
| **Started** | 2026-08-02 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | not written yet |
| **Claude tokens used** | not measured |

## Problem

Two files hold the same content in a different order — an env file whose keys
moved, a log sorted differently, a list someone re-grouped — and the diff reports
every moved line twice, once as a deletion and once as an addition. The question
the reader has is "is anything actually different?", and the answer is buried.

The **Structure** toggle answers this for JSON, YAML, XML and CSV
(`structuredKind`, `utils/structuralDiff.js:107`) — reordering keys stops
counting there. Plain text has no equivalent: `canCompareStructure` is false, so
there is no control at all.

## Solution — three readings, one to pick

The engine is the same in each; what differs is what the reader SEES, which is
why this is a decision and not a detail.

| | what it does | cost | what it costs the reader |
|---|---|---|---|
| **A · Sorted comparison** | sort both sides' lines, then diff exactly as now | small | line numbers no longer match the file; everything else (word highlights, search, export, copy-as-patch) keeps working |
| **B · Multiset difference** | show only lines present in one side and not the other, counts respected | medium — a new viewer | no line numbers at all, no in-place context; it answers "what is missing" and nothing else |
| **C · Moved-block detection** | keep the real order, mark moved lines as unchanged | large — Monaco has no native move rendering, so it needs a custom pass plus decorations | nothing; it is the prettiest answer and the only one that keeps line numbers honest |

**Recommended: A**, labelled so the trade is visible — `Ignore order` with a tip
saying line numbers follow the sorted view, not the file. It reuses the whole
text path, ships in hours rather than days, and answers the actual question. C is
the better feature if this turns out to be something you reach for daily; it is
worth doing on its own evidence rather than up front.

## Scope

**In (for A):** an `Ignore order` checkbox beside `Ignore whitespace`, shown for
text comparisons only; sorting applied to both sides before they reach Monaco;
the state carried in the tab snapshot like `semanticView` and
`ignoreTrimWhitespace` already are.

**Out:**

- Streamed comparisons. A file too large to hold cannot be sorted in memory, and
  the control must say so rather than half-work — the `STREAMED_LIMITS` pattern.
- Structured formats, which already have the Structure toggle.
- Sorting by anything but the line's own text (no key extraction, no numeric
  sort).

## Design (for A)

- The checkbox joins the toolbar's view group, `v-if` on the comparison being
  text and not streamed, disabled with a reason when streamed.
- The sort happens where the comparable is built, not in the viewer, so the
  export, the patch and the image all see the same thing the screen does.
- A stable sort, and a trailing-newline-preserving join, so a file that was
  already sorted is byte-identical to itself.

### Theme verdict — all 14

No new surface: one more checkbox in a group of checkboxes. Table omitted.

## Security rules touched

None of the eight.

## Test plan

- **unit — `tests/renderer/utils/…`**: the sort is a pure helper — same lines in
  a different order compare identical; a genuinely added line still reports;
  duplicates are preserved (a multiset, not a set); trailing newline survives.
- **unit — stores**: the flag rides the tab snapshot and restores with it.
- **e2e**: two files with shuffled lines report no differences with the box
  ticked, and the real difference when one line changes.
- **red → green** — each watched failing first.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | one bullet under "The smaller things" |
| `docs/screenshots/*.png` | no | the toolbar group is not legible in the captured frames |
| `docs/roadmap.md` | no | opens no track |

## Implementation plan

- [ ] 1. Pick the reading (A, B or C) — blocking.
- [ ] 2. Branch + token baseline.
- [ ] 3. Pure sort helper + tests, red first.
- [ ] 4. Wire it into the comparable, behind the flag.
- [ ] 5. Toolbar checkbox + the streamed refusal.
- [ ] 6. e2e.
- [ ] 7. README, `npm run check`, audit.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | Presented as three readings rather than built | what the reader sees differs completely between them, and picking one silently is the expensive kind of guess | assuming "ignore order" means sorted |
