# Snippet bar and quieter details

|                                         |                                               |
| --------------------------------------- | --------------------------------------------- |
| **Status**                              | in-progress                                   |
| **Progress**                            | 4 / 7 steps                                   |
| **Branch**                              | stack below, from `fix/base64-partial-decode` |
| **Started**                             | 2026-10-31                                    |
| **Finished**                            |                                               |
| **Bugs found and fixed this iteration** | 5 / 5                                         |
| **Token baseline**                      | 2026-10-31T07:11:09Z                          |
| **Claude tokens used**                  |                                               |

## Problem

Seen by the maintainer on v0.15.0.

1. The snippet bar is the loudest thing on screen: a 16px 600 name and solid colour pills, with tags starting at a fixed point and an always-on dashed box (`SnippetDocumentHead.vue`, `ui.css` `.tag-chip.etag`).
2. Editor text touches the gutter rule: Monaco's 8px `lineDecorationsWidth` sits left of the rule, and numbers touch the window edge at 4 digits (`SnippetDocument.vue:57`, `SnippetEditor.css:50`).
3. A new row is too bright: a 26% accent wash, a 3px accent bar and an accent pill, repeated in every tag section the item is listed under (`ui.css:771`).
4. Plain button hover is a 22% ink wash with an accent ring, dark on dark (`tokens.css:88`, `ui.css:135`).

Bugs:

1. Base64 decode fails the whole input if only part of it is Base64 (`utils/base64.js:26`).
2. Base64's decode summary reads `t.length`, the i18n function, not the input (`ToolBase64.vue:38`).
3. Base64's result box is shorter when empty, so the dialog jumps on the first character (`ToolBase64.css`).
4. Tool checkboxes sit above their labels: `.dialog label` sets a column and `.tb-chk` and its siblings never set a row (`ui.css:585`).
5. With many tags, the add-tag popup runs off the window and the whole app gets scrollbars (`TagChipRow.css` `.tag-pop`).

## Solution

Reuse what exists: the sidebar's dot and word tag and its three-then-+N rule, and the existing type scale. Six stacked PRs, one per change.

| option                                | why not                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| Outline or tinted tags (Q18 B, C)     | the user chose dot and word                                     |
| One-line bar (Q19 B)                  | tags start wherever the name ends, and a long name gets cut off |
| 14px 500 name (Q19 C)                 | breaks the rule that titles are 600                             |
| Keep the tinted, ruled gutter (Q20 B) | the user chose no rule                                          |
| Plain word or dot for New (Q21 A, C)  | the user chose the softer accent                                |
| Faint wash and ring on hover (Q22 B)  | the wash misses the 1.15 floor on 11 themes                     |

## Scope

**In:** the five bugs; the snippet bar; the snippet editor's gutter; the New row (snippets and saved diffs, which share it); hover on every plain `.btn`.

**Out:** comparison panes' gutters, Quick Look's compose head, the tag colour palette, and pinned or selected row colours. Marking a new row in only one tag section is also out.

## Design

**Source of truth:** https://claude.ai/artifact/Qed2FCbTtcWswSLRpJUik5
**Approved design:** page "Approved · snippet bar", signed off 2026-10-31.

| artboard               | shows                                           |
| ---------------------- | ----------------------------------------------- |
| Q18                    | tag look: dot and word chosen                   |
| Q19                    | name and layout: title and subtitle chosen      |
| Q20                    | gutter: no rule chosen; long-file measurement   |
| Q21                    | New row: softer accent chosen                   |
| Q22                    | hover: soft wash chosen                         |
| Q23                    | everything together; the bar joins the document |
| Approved · snippet bar | frozen copies of the chosen design              |

- **Name:** `--font-md`, 600, `--text`; the field's box shows on hover and focus only, on every theme.
- **Tags:** `.tag-word` styling at `--font-xs`, `--text-meta`, a 7px `--tag-ink` dot; three shown, then a plain `+N` that opens the list. "Add tag" is plain text with a +; its input shows an edge only while typing.
- **Bar:** two lines in `--head-band` (49px), flush left.
- **Gutter:** `--bg`, no rule, a 16px gap and a `--space-2` inset. Monaco has no inset setting, so `lineDecorationsWidth` is 22 and the numbers take a `--space-2` margin from it.
- **New row:** wash `color-mix(--accent 10%)`, 2px bar at `--accent` 55%, pill with a `--border` edge and `--text-meta` label at 500. The 60s lifetime is unchanged.
- **Hover:** `--btn-face-hover` is `--text` at 10%; no accent ring. Focus keeps `--focus-ring`.

### Theme verdict: all 20

Measured from computed colours with the bar on `--bg`. Floors: tag label 4.5, dot 3, New label 4.5, hover step 1.15, hover label 4.5. `make theme-sweep` re-checks the built UI.

| theme    | verdict | tag label | dot   | New label | hover step | hover label | note                                                                 |
| -------- | ------- | --------- | ----- | --------- | ---------- | ----------- | -------------------------------------------------------------------- |
| light    | pass    | 11.98     | 6.01  | 9.09      | 1.24       | 14.9        |                                                                      |
| dark     | pass    | 10.37     | 10.02 | 8.47      | 1.3        | 11.24       |                                                                      |
| solar    | pass    | 7.58      | 5.9   | 6.11      | 1.2        | 10.16       |                                                                      |
| neon     | pass    | 11.09     | 10.28 | 8.33      | 1.3        | 12.03       | accent wash stays faint at 10%                                       |
| nord     | pass    | 7.58      | 6.62  | 5.05      | 1.31       | 6.68        |                                                                      |
| sepia    | pass    | 6.19      | 4.42  | 4.81      | 1.18       | 7.25        | lowest tag and New contrast                                          |
| dim      | pass    | 9.14      | 9.29  | 7.09      | 1.31       | 9.93        |                                                                      |
| beacon   | pass    | 16.83     | 11.12 | 13.73     | 1.25       | 15.72       | same as contrast                                                     |
| meridian | pass    | 7.98      | 5.57  | 6.74      | 1.19       | 9.76        |                                                                      |
| linen    | pass    | 9.03      | 5.61  | 6.97      | 1.21       | 11.24       |                                                                      |
| bloom    | pass    | 8.61      | 5.52  | 6.66      | 1.21       | 10.58       |                                                                      |
| nyan     | pass    | 11.75     | 10.13 | 9.59      | 1.29       | 11.68       | accent wash stays faint at 10%                                       |
| matrix   | pass    | 11.73     | 10.62 | 9.05      | 1.27       | 13.27       | accent wash stays faint at 10%                                       |
| contrast | pass    | 17.4      | 6.01  | 13.13     | 1.25       | 15.02       | name box shows on hover and focus only; hard keyline elsewhere stays |
| volcano  | pass    | 16.96     | 11.12 | 14.68     | 1.24       | 16.06       | same as contrast                                                     |
| amber    | pass    | 8.93      | 10.45 | 7.07      | 1.22       | 10.03       |                                                                      |
| tide     | pass    | 10.74     | 9.42  | 7.66      | 1.32       | 10.25       |                                                                      |
| ember    | pass    | 11.28     | 9.87  | 8.37      | 1.31       | 10.67       |                                                                      |
| graphite | pass    | 11.27     | 9.59  | 8.1       | 1.32       | 10.63       |                                                                      |
| vector   | pass    | 11.53     | 6.01  | 8.77      | 1.23       | 12.85       |                                                                      |

## Security rules touched

None: no IPC, no fs, no crypto, no new dependency, no external link. Base64 decode stays pure in `utils/`.

## Test plan

- **Red first for all five bugs.**
- **unit:** `tests/renderer/utils/base64.test.js`: mixed text decodes its Base64 parts and keeps the rest byte for byte; ordinary words, paths and short runs stay; invalid UTF-8 and control characters stay; wrapped and URL-safe input still decode whole; nothing decodable still throws.
- **e2e:**
  - `e2e/tool-dialog-size.spec.mjs`: the Base64 dialog keeps its height from empty to one line; every tool's checkbox sits beside its label; decode's count is the input's length.
  - `e2e/snippet-tag-chips.spec.mjs`: three tags then +N; +N lists them all; the add popup stays inside a narrow window with no page scroll.
  - `e2e/new-row-marker.spec.mjs` and a gutter spec: the computed values above, and a gap of at least 8px between number and text at 4 digits.
- **Guards:** `npm run check:themes` for the hover ladder; the tag word and +N in the sweep's `snippet-head-row` surface.
- **Seed fixtures:** no change; no format or data shape changes.

## Docs impact

| surface                  | needed? | what changes                                                  |
| ------------------------ | ------- | ------------------------------------------------------------- |
| `README.md`              | no      | no feature or architecture change                             |
| `docs/screenshots/*.png` | yes     | the hover, bar and gutter appear in captured states           |
| `docs/roadmap.md`        | no      | polish on a shipped track                                     |
| `docs/brand/roadmap.svg` | no      | same                                                          |
| `docs/standards.md`      | yes     | the hover rule, the document head under Alignment             |
| `docs/features.md`       | yes     | Base64 partial decode (slice 1); three tags then +N (slice 3) |

## Delivery

| #   | slice                                   | branch                      | base   | PR   | status |
| --- | --------------------------------------- | --------------------------- | ------ | ---- | ------ |
| 1   | Base64 partial decode and summary count | `fix/base64-partial-decode` | `main` | #160 | open   |
| 2   | Tool checkboxes and a steady result box | `fix/tool-dialog-controls`  | 1      | #161 | open   |
| 3   | Snippet bar, and the add-tag popup      | `improvement/snippet-bar`   | 2      | #163 | open   |
| 4   | Editor gutter                           | `improvement/editor-gutter` | 3      |      |        |
| 5   | Softer New row                          | `improvement/new-row-quiet` | 4      |      |        |
| 6   | Button hover, screenshots               | `improvement/button-hover`  | 5      |      |        |

## Implementation plan

- [x] 1. Slice 1: red unit tests, partial decode, the count; PR.
- [x] 2. Slice 2: red e2e, checkbox row across tools, stable result height across tools; PR.
- [x] 3. Slice 3: red e2e, name, tags, three then +N, bar ground, popup bounds; sweep surface; standards; PR.
- [x] 4. Slice 4: red e2e, gutter; PR.
- [x] 5. Slice 5: red e2e, New row; PR.
- [ ] 6. Slice 6: guard floors, hover tokens, standards, features and screenshots; PR.
- [ ] 7. `/validate`, merge the stack bottom-up.

## Decisions

| date       | decision                                                                                                                                                                        | why                                                   | rejected                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| 2026-10-31 | The whole bar is in scope                                                                                                                                                       | the user chose it                                     | tags only, layout only, removing the bar |
| 2026-10-31 | Q18 dot and word, left aligned, more than three collapse                                                                                                                        | the user asked                                        | outline, tint                            |
| 2026-10-31 | Q19 title and subtitle, 13px 600                                                                                                                                                | the user chose it                                     | one line, 14px 500                       |
| 2026-10-31 | Q20 no rule, 16px gap                                                                                                                                                           | the user chose it                                     | keep tint and rule                       |
| 2026-10-31 | Q21 softer accent                                                                                                                                                               | the user chose it                                     | plain word, dot                          |
| 2026-10-31 | Q22 soft wash                                                                                                                                                                   | the user chose it                                     | wash and ring                            |
| 2026-10-31 | Q23 the bar is part of the document, with no band or rule; the name's box shows on hover and focus only on every theme                                                          | the user chose it; it is a title and not a form field | keep the band                            |
| 2026-10-31 | Base64: try the whole input first; otherwise decode runs of 8 or more Base64 characters that give valid, printable UTF-8, and leave the rest. Nothing decodable keeps the error | keeps ordinary words intact                           | shorter runs (too many false hits)       |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] UI seen running (`make e2e`, theme sweep)
- [ ] every Docs-impact "yes" done
- [ ] token usage measured, header row filled
