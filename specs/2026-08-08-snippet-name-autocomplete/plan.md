# Snippet name autocomplete — inline ghost text

|                                         |                                  |
| --------------------------------------- | -------------------------------- |
| **Status**                              | in-progress                            |
| **Progress**                            | 9 / 10 steps                     |
| **Branch**                              | `feat/snippet-name-autocomplete` |
| **Started**                             | 2026-08-08                       |
| **Finished**                            | —                                |
| **Bugs found and fixed this iteration** | 0 / 0                            |
| **Token baseline**                      | 2026-08-08T09:29:17Z                                |
| **Claude tokens used**                  | —                                |

## Problem

Snippet names are typed from scratch every time, and a library grown over months
is full of near-repeats: `Deploy — prod`, `Deploy — staging`, `Deploy — dev`.
The user retypes the shared head of that name on every capture. Nothing in the
app offers it back — `SnippetEditorDialog.vue:126` and `QuickLookCompose.vue:74`
are both bare `<input>`s, and the only name assistance that exists is
`SnippetNameHint`, which lists `{{template}}` tokens rather than completing what
you are typing.

The cost is highest in the launcher, which exists to be fast: `⌘N` now carries
the search query in as the name, so the moment a name is a near-repeat the user
is retyping something the app already holds in memory.

## Solution

Inline ghost text with **shell-completion semantics**: complete to the longest
common prefix of every name that matches what has been typed, or to the whole
name when exactly one matches. Typing `Dep` against the three names above
completes to `Deploy — ` and stops — it never guesses the distinguishing part.

That rule is the whole design, and it is why this is worth building rather than
a fuzzy "did you mean". It is deterministic, it is exactly the repeated-prefix
pain the user described, and it is a pure function of (typed, names) so it
unit-tests without a mount.

Rendering: a two-layer field. An overlay **behind** the input holds a
transparent copy of the typed text (to occupy its exact width) followed by the
ghost in `--text-dim`; the real input sits on top, opaque, with a transparent
background so the ghost shows through. Same metric-parity discipline as
`useHighlightedInput`, but the input keeps its own opaque text, so native
selection and caret rendering are untouched.

| option                                                     | why not                                                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A suggestion chip row (the `TagChipsField` pattern)        | Lowest-risk to build, but it adds a THIRD keyboard driver to the launcher — a window whose single `@keydown` model has already produced several bugs. Ghost text needs no navigation at all. |
| Complete to the best/most-recent whole match               | Guesses the part that distinguishes one snippet from another. `Deploy — dev` appearing when you meant staging is worse than no suggestion.                                                   |
| Fuzzy matching (the `rank`/`scoreItem` used by the search) | Right for search, wrong for completion: a completion must be a literal continuation of what was typed, or accepting it produces text the user never saw growing.                             |
| Transparent input over an overlay that draws everything    | What the body highlighter does, because it must colour runs. Here only the ghost needs drawing, and leaving the input opaque keeps native selection colours.                                 |
| Mine snippet CONTENT for completions                       | Permitted now that non-secret content is low-security, but it needs a decrypt pass per snippet and a first-run index cost. Its own change, once this earns its keep.                         |

## Scope

**In:**

- `utils/nameComplete.js` — the pure longest-common-prefix completion.
- `composables/useNameComplete.js` — accept keys, scroll mirror, refs.
- A shared `.ghost-field` overlay pair in `ui.css` (two surfaces need it).
- Wiring in `QuickLookCompose.vue` and `SnippetEditorDialog.vue`.
- One launcher foot hint for the accept key.
- A `theme-sweep` `SURFACES` probe for the ghost ink.

**Out:**

- Completion in the snippet BODY, and any content-derived index. Recorded above.
- Tag completion — `useTagInput` already suggests tags; this does not touch it.
- The main window's search field and the launcher's search box. Search wants
  fuzzy ranking, which is the opposite of literal completion.

## Design

Token-driven, and it needs **no new token**. The ghost is hint ink, which the
repo already has: `--text-dim`, the same token the placeholders in both fields
already use. It is governed by an existing floor —
`check-theme-depth.mjs:134` holds `dim/panel` at **3.0** as `kind: 'text'` — so
the ghost inherits a ratchet rather than inventing one.

The overlay pair:

- Both layers resolve the same `font-family`, `font-size`, `line-height`,
  `padding` and `border-width`, or the ghost sits at the wrong offset. Set on a
  shared selector so one cannot be changed alone — the rule the body overlay
  already follows.
- `white-space: pre` on the overlay, and its `scrollLeft` mirrors the input's,
  because a single-line input scrolls horizontally once the text overflows.
- Overlay is `aria-hidden="true"` and `pointer-events: none`. The ghost is never
  in the input's value, so selection, copy and the saved name cannot include it.

### Theme verdict — all 14

`--text-dim` parsed from `styles/themes.css`, against `--bg` (the launcher's
compose field) and `--bg-panel` (the editor dialog's).

| theme    | ground | `--text-dim` | dim/bg | dim/panel | verdict                                      |
| -------- | ------ | ------------ | ------ | --------- | -------------------------------------------- |
| light    | light  | `#565a5a`    | 6.99   | 6.06      | pass                                         |
| dark     | dark   | `#8b949e`    | 6.15   | 5.62      | pass                                         |
| solar    | light  | `#8a7638`    | 4.36   | 3.99      | pass                                         |
| neon     | dark   | `#8098c0`    | 6.62   | 6.04      | pass — no accent, so no halo                 |
| nord     | dark   | `#9aa5b8`    | 5.02   | 4.05      | pass                                         |
| sepia    | light  | `#7d6840`    | 3.93   | **3.44**  | pass — worst of the 14, clears the 3.0 floor |
| dim      | dark   | `#9a8f7f`    | 5.52   | 5.12      | pass                                         |
| beacon   | dark   | `#cccccc`    | 13.08  | 12.26     | pass — hard keyline untouched                |
| meridian | light  | `#5c6b70`    | 5.14   | 4.90      | pass                                         |
| linen    | light  | `#6f685b`    | 5.16   | 4.56      | pass                                         |
| bloom    | light  | `#7a6570`    | 4.92   | 4.31      | pass                                         |
| nyan     | dark   | `#b79fcf`    | 8.08   | 7.44      | pass — flat ink, no accent glow              |
| matrix   | dark   | `#4fae6a`    | 7.25   | 6.87      | pass — flat ink, no accent glow              |
| contrast | light  | `#333333`    | 12.63  | 11.29     | pass — hard keyline untouched                |

The ghost must read as clearly secondary to the typed text, which it does on
every theme: `--text` scores 9.77–21 against the same grounds, so the typed and
suggested halves are never confusable.

## Security rules touched

**None — no IPC, no fs, no crypto, no new dependency, no external link.**
Everything reads `store.entries[].name`, which is already plaintext metadata in
renderer memory and already rendered in the sidebar and the launcher list.

Two deliberate guards, neither required by a rule but both worth stating:

- **Secret snippets do not contribute names.** A secret's guarantee is about its
  contents, not its name, so this is caution rather than obligation — but a name
  is often a hint at what the secret is, and suggesting it into an unrelated
  snippet is a leak of intent nobody asked for.
- The ghost is never part of the input value, so it cannot be copied out of a
  field the user did not knowingly fill.

## Test plan

Written before the code.

- **unit** — `tests/renderer/utils/nameComplete.test.js`: the LCP rule (three
  `Deploy — *` names complete to `Deploy — ` and no further); exactly one match
  completes to the whole name; no match completes to `''`; matching is
  case-insensitive but the completion preserves the STORED casing after the
  caret; an empty or whitespace-only input suggests nothing; a name that already
  equals a stored name suggests nothing; a typed string containing `{{` is
  refused outright.
- **unit** — `tests/renderer/composables/useNameComplete.test.js`: Tab accepts
  and swallows the key; `→` accepts only when the caret is at the end; `→`
  mid-text is left to the caret; every other key is untouched; accepting fires
  the model update once and clears the ghost; the overlay's `scrollLeft` mirrors
  the input's.
- **e2e** — `e2e/snippet-name-autocomplete.spec.mjs`: in the launcher, save two
  `Deploy — *` snippets, then `⌘N` and type `Dep` — the ghost reads `loy — `,
  Tab accepts, and the SAVED name is what was on screen. In the main editor, the
  same completion appears and `SnippetNameHint` still renders below it (they
  occupy different space and must not fight). Ghost text is absent from
  `inputValue()` at every step — that is the assertion that it never becomes
  content.
- **red → green** — each unit file watched failing before its source exists;
  the two subtlest rules (LCP stopping short, ghost never entering the value)
  additionally proved by reverting and re-running.
- **seed fixtures** — none. No new format, no changed data shape.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                           |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | **yes** | the Snippets row and the Quick look-up keys bullet both describe naming; a completion that fills the name is a user-visible feature and belongs there. |
| `docs/screenshots/*.png` | no      | the ghost only exists mid-typing, and none of the six captured states has a focused, partially-typed name field.                                       |
| `docs/roadmap.md`        | no      | grep for "autocomplete"/"suggest" returns nothing — no track to move. A new one is not warranted for a single field.                                   |
| `docs/brand/roadmap.svg` | no      | same.                                                                                                                                                  |
| `docs/*.md`              | no      | no IPC surface, no crypto change, no new glossary term, no standards rule added.                                                                       |

## Implementation plan

- [x] 1. **Failing e2e first.** `e2e/snippet-name-autocomplete.spec.mjs`, both
      surfaces. Run it, record the failure.
- [x] 2. **`utils/nameComplete.js`** + its unit test, red → green. The LCP rule,
      the template refusal, the casing rule.
- [x] 3. **`composables/useNameComplete.js`** + its unit test: accept keys,
      caret-at-end guard, scroll mirror.
- [x] 4. **`.ghost-field` in `ui.css`** — the shared overlay pair, since two
      components need it and a scoped copy in the second would drift.
- [x] 5. **Wire `QuickLookCompose.vue`.** Watch the 250/120/100 caps: that file
      already carries the body overlay, so split a child rather than compress.
- [x] 6. **Wire `SnippetEditorDialog.vue`**, and confirm `SnippetNameHint` still
      sits below the field untouched.
- [x] 7. **i18n** — one hint key for the accept chip; `pseudolocale.mjs`;
      `check:i18n` and `check:rawtext`.
- [x] 8. **`theme-sweep` probe** — add the ghost to `SURFACES` in
      `scripts/theme-sweep.mjs`, which also closes a finding carried from the
      previous change.
- [x] 9. **README** — the two lines named above.
- [ ] 10. **Close.** `npx prettier --write` on touched files, `npm run check`,
      the launcher + snippet e2e on the host, then `/validate`.

## Decisions

| date       | decision                                                   | why                                                                                                                                                                              | rejected                                               |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2026-08-08 | Complete to the longest common prefix, not to a best match | A completion must never invent the part that tells two snippets apart; LCP stops exactly where the library stops agreeing                                                        | most-recent match, frecency ranking, fuzzy `rank()`    |
| 2026-08-08 | Ghost ink is `--text-dim`, no new token                    | It is hint ink, the same token both placeholders already use, and it is already held at 3.0 by `check-theme-depth.mjs:134` — a new token would invent a second ratchet           | a bespoke `--ghost-ink`                                |
| 2026-08-08 | The input stays OPAQUE; only the ghost is drawn behind     | The body overlay makes its textarea transparent because it must colour runs. Here that would trade away native selection rendering for nothing                                   | mirroring the body overlay exactly                     |
| 2026-08-08 | No Escape-to-dismiss                                       | Escape already closes the compose panel; a second meaning on the same key in the same field is how the launcher's key bugs happened. The ghost clears itself as you type         | Escape dismisses the ghost first                       |
| 2026-08-08 | Secret snippets contribute no names                        | Not required — the guarantee is about contents — but a secret's NAME hints at what it is, and offering it inside an unrelated snippet leaks intent                               | indexing every name                                    |
| 2026-08-08 | Branch stacks on `improvement/quicklook-keyboard-capture`  | Direct overlap: `QuickLookCompose.vue`, the launcher key model and `useCaretBackOut`'s control handling are all unmerged work this needs. PR #34 is green; rebase after it lands | branching from `main` and resolving the conflict later |

## Validation

Recorded as fact, not intention.

- [ ] `/validate` — summary below, full report in `quality-audit.md`
- [ ] `npm run check` — paste the real result
- [ ] UI seen running — both surfaces, host e2e
- [ ] every Docs-impact "yes" done, or which is deferred and why
- [ ] `make local-seed` — n/a, no fixture change
- [ ] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category    | tokens |
| ----------- | -----: |
| input       |        |
| output      |        |
| cache write |        |
| cache read  |        |
| **total**   |        |

**Outcome:**
