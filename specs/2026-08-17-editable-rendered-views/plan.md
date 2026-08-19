# Editable rendered views — Markdown and Jira

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 16 / 16 steps — code complete, `/validate` outstanding |
| **Branch** | `feat/editable-rendered-views` |
| **Started** | 2026-08-17 |
| **Finished** | |
| **Bugs found and fixed this iteration** | 1 / 1 |
| **Token baseline** | 2026-08-17T10:04:03Z |
| **Claude tokens used** | |

## Problem

In the snippet editor, a Markdown or Jira snippet has two views and only one of
them accepts a caret.

`SnippetEditorDialog.vue:156-162` mounts Monaco when `plain` is true, and
`JiraRendered` / `MarkdownRendered` when it is false. Both preview components run
a parser into a block tree (`parseJira`, `parseMarkdown`) which `JiraRendered.vue`
draws as real elements. Nothing walks back: there is no tree → text serializer
anywhere in the repo for either dialect, and `JiraRendered`'s root carries no
`contenteditable`. The rendered view is a projection, so a click in it moves
nothing and a keystroke goes nowhere.

The consequence is a mode switch for every edit. `FormatToolbar` is gated
`v-if="hasPreview && plain && editMode"` (`SnippetEditorDialog.vue:146`), so even
the bold/italic buttons vanish the moment you look at the rendered form — you
write in one view and check your work in the other. Task checkboxes make it
concrete: `JiraRendered.vue:36` renders them `disabled tabindex="-1"`, so a
Markdown to-do list renders as a to-do list you cannot tick.

Repro (either dialect): new snippet → syntax `markdown` → type `- [ ] ship it`
→ press **Rendered**. The checkbox is inert, the toolbar is gone, typing does
nothing. Same with syntax `jira` and `* item`.

## Solution

Make the rendered view a **contenteditable WYSIWYG** for both dialects: the caret
lives in the rendered DOM, that DOM is the source of truth while you type, and
every edit is walked back to markup text.

The two parsers already emit the **same block tree** — `heading` / `list` /
`table` / `quote` / `code` / `paragraph`, with inline `text` / `strong` / `em` /
`ins` / `del` / `code` / `link`. Both are drawn by the same `JiraRendered` +
`JiraInline` pair. So the read-back is shared and only the markers differ:

| unit | job |
|---|---|
| `utils/domToBlocks.js` | rendered DOM → the block tree both parsers emit. **Shared** — one renderer, one reader |
| `utils/markdownSerialize.js` | block tree → Markdown. Inverse of `parseMarkdown` |
| `utils/jiraSerialize.js` | block tree → Jira wiki markup. Inverse of `parseJira` |
| `composables/useContentEditable.js` | caret offset save/restore, the typing guard, plain-text paste, Tab/Shift-Tab list nesting |
| `utils/caret.js` | the caret as a character offset — added during the build; a (node, offset) pair points at a detached node after a re-render |
| `utils/domFormat.js` | the toolbar applied to the DOM — added during the build; see the Decisions row |
| `components/RenderedEditor.vue` | the contenteditable host; takes a `dialect` prop and renders the tree the way `JiraRendered` does |

Typing runs `domToBlocks(root)` → `serialize<Dialect>(blocks)` → `content`.
Because that closes a loop back into the props `RenderedEditor` renders from, the
component tracks the string it last emitted and re-renders **only** when `content`
changes from outside (toolbar, Plain view, file drop, format) — this is the
caret-jump mitigation, and it is what "source of truth = the DOM" buys.

`JiraRendered.vue` and `MarkdownRendered.vue` keep their current read-only
behaviour. Both are also mounted by `QuickLookCompose.vue:119-120` beside its own
textarea, where a read-only preview is correct; `RenderedEditor` is a sibling, not
a replacement.

| option | why not |
|---|---|
| Click a block → edit its raw source inline | Offered and **rejected by the user** in favour of full WYSIWYG. Cheaper and lossless (source stays the truth), but the caret never lives in the rendered text |
| Live split view (Monaco ∥ preview, scroll-synced) | Offered and rejected. Does not make the rendered view editable — it only removes the reason to leave it |
| A third-party WYSIWYG (ProseMirror / TipTap / Milkdown) | Rule 2. ProseMirror is ~6 production packages and TipTap more; both bring a schema layer that would have to be taught this repo's block tree, and **neither speaks Jira wiki markup at all** — the dialect that has no off-the-shelf editor is exactly half this spec |
| `document.execCommand` for bold/lists | Deprecated, writes browser-flavoured markup (`<b>`, `<font>`) that `domToBlocks` would then have to understand, and it is inconsistent across the Chromium versions Electron steps through. The existing `markdownMarkup.js` / `jiraMarkup.js` transforms already do this losslessly on text |
| One serializer with a marker table | The dialects disagree on *structure*, not only on markers: Jira list depth is marker repetition (`**` = depth 2) while Markdown's is two-space indent; Jira quotes nest as a `{quote}` fence while Markdown prefixes every line; Markdown tables carry an alignment row Jira has no concept of. A table-driven single function becomes a pile of `if (dialect)` inside every branch |
| Re-render from `content` on every keystroke | The caret jumps to the document start on every character. This is the failure mode the typing guard exists to prevent |

### Round-trip losses, accepted up front

The DOM does not record which of several equivalent spellings you typed, so a
round-trip normalises. Stated here because the user accepted this when choosing
WYSIWYG, and because the tests assert the table rather than pretend otherwise.

**Markdown:**

| you typed | it comes back as |
|---|---|
| `* item` / `+ item` | `- item` |
| `_em_` | `*em*` |
| `__strong__` | `**strong**` |
| `~~~` code fence | ``` ``` ``` |
| `1)` ordered marker | `1.` |

**Jira:**

| you typed | it comes back as |
|---|---|
| `bq. line` | `{quote}` fence — `bq.` is single-line only, the tree is not |
| `{code:java}` | `{code}` — **already lost today**: `parseJira:112-120` stores `{type:'code', code}` and never captures the language |
| `[label\|label]` | `[label]` where label and href match |

**Cross-dialect:** `ins` (Jira `+text+`, drawn as `<u>`) has no Markdown
equivalent. `serializeMarkdown` degrades it to plain text rather than inventing
`<u>` markup that `parseMarkdown` could not read back.

Losses only ever fire on a block the user actually edited: an untouched snippet
opened, viewed and closed is byte-identical, because nothing is serialized until
an `input` event fires.

## Scope

**In:**

- Contenteditable rendered view for **Markdown and Jira**, edit mode only.
- Headings, paragraphs, bullet/ordered/task lists, quotes, fenced code, tables,
  and the full inline set `JiraInline` draws (strong, em, ins, del, code, link).
- Task checkboxes become tickable, writing `- [x]` / `- [ ]` back to Markdown
  source. (Jira has no task syntax — `jiraRender.js` never emits `task`.)
- `FormatToolbar` works in the rendered view for both dialects, not just Plain.
  `useFormatToolbar` already switches marker sets on `isMarkdown`.
- Plain-text-only paste.
- Tab / Shift-Tab nesting inside lists.
- Caret preserved across an external content change.
- Secret snippets: the editable host unmounts entirely while masked, exactly as
  Monaco does today.

**Out:** *(recorded, not drifted)*

- **QuickLookCompose stays read-only.** It already has a textarea beside the
  preview; nothing was reported broken there.
- Undo/redo beyond what contenteditable gives natively. Monaco owns the undo
  stack in Plain view; wiring one across both views is its own change.
- Drag-and-drop *within* the rendered text.
- Markup neither parser handles today (Markdown footnotes, reference links, HTML
  blocks; Jira colour/panel/noformat macros). The editable view can only be as
  expressive as the parser — widening either is a separate spec.
- Recovering `{code:java}` language hints. The parser drops them before the tree
  exists, so this is a `jiraRender.js` change, not a serializer one.

## Design

**No new colour, and that is the point.** The editable region reuses the rule the
Monaco editor already has: `.editor` (1px `--border`, `--radius`) plus
`.editor-area.editing .editor`
(`color-mix(in srgb, var(--accent) 50%, var(--border))`), already shipped and
already swept at `SnippetEditorDialog.css:19-21`. So the rendered view picks up
the identical "this is live" keyline Monaco shows, on every theme, by
construction.

Three genuinely new declarations, all token-driven:

| what | declaration | why |
|---|---|---|
| caret strength | `caret-color: var(--text)` on the editable root | the caret defaults to `currentColor`, which is `--text-dim` inside `.ji-quote` and `h4`–`h6` (`JiraRendered.css`). On the dimmer themes that is a caret you lose |
| the tickable box | drop `disabled`/`tabindex="-1"`; keep `accent-color: var(--accent)` | already the token; removing the attributes is the whole change |
| focus | `outline: none` on the root, keyline carries it | two rings (UA outline + the accent keyline) on one box reads as an error state |

Everything else is inherited: the `.ji-*` classes, `--space-*`, `--font-*`,
`--radius`. No literal colour, font-size or radius, so `check:styles` has nothing
to catch. No new control, so the `--control-h` / `.band` rules are not engaged.

### Theme verdict — all 20

Values parsed from `styles/themes.css` (the `:root` / `:root[data-theme=…]`
blocks), never guessed. Ground is `--bg`. Eight are light-ground.

| theme | ground | `--bg` | `--accent` | verdict | note |
|---|---|---|---|---|---|
| light | light | `#ffffff` | `#c2410c` | pass | floating-canvas inversion; keyline is the shipped Monaco rule |
| dark | dark | `#0d1117` | `#2f81f7` | pass | |
| solar | light | `#fffdf6` | `#cb4e0a` | pass | |
| neon | dark | `#090d18` | `#22d3ee` | pass | high-chroma accent sits on the **keyline**, never a glow — no halo |
| nord | dark | `#2e3440` | `#88c0d0` | pass | |
| sepia | light | `#e9dcbe` | `#9c4f1f` | pass | |
| dim | dark | `#1b1917` | `#d9a441` | pass | |
| beacon | dark | `#000000` | `#4cc2ff` | pass | hard keyline `#e0e0e0` **preserved** — the change adds a caret colour, removes no border |
| meridian | light | `#f5f7f4` | `#0d8484` | pass | |
| linen | light | `#faf7f0` | `#3f5b8a` | pass | |
| bloom | light | `#f9f4f5` | `#b0446e` | pass | |
| nyan | dark | `#160a20` | `#ff2ecb` | pass | as neon — keyline only |
| matrix | dark | `#020a04` | `#00ff41` | **watch** | `accent-color: #00ff41` checkbox: the UA picks the tick glyph by luminance. Verify the tick is legible, do not hand-colour it |
| contrast | light | `#ffffff` | `#1633d4` | pass | hard keyline `#111111` preserved |
| volcano | dark | `#000000` | `#ff5c33` | pass | hard-ish keyline `#ffc9a4` preserved |
| amber | dark | `#0f0a02` | `#ffb000` | **watch** | `--text` is `#ffc95e`, not white. `caret-color: var(--text)` is correct here and is *why* the rule exists — the dimmed caret would have been near-invisible |
| tide | dark | `#0b1a1e` | `#6ed2c0` | pass | |
| ember | dark | `#1a1013` | `#ffa285` | pass | |
| graphite | dark | `#161616` | `#d4d4d4` | pass | near-neutral accent; the keyline still steps off `#3d3d3d` |
| vector | light | `#ffffff` | `#0b57a4` | pass | |

Two "watch" rows are checkbox-tick and caret legibility — both measured in the
theme sweep step, not assumed.

## Security rules touched

**Rule 8 (no injection sinks) — the one that matters, and it is engaged twice.**

1. **Rendering.** `RenderedEditor` draws the block tree the way `JiraRendered`
   does: `v-for` + interpolation + `<component :is>` over a fixed heading-level
   set. No `v-html`, no `innerHTML`, no `insertAdjacentHTML`. `contenteditable`
   is not a sink — it lets the *user* mutate the DOM, it does not parse a string
   into markup.
2. **Paste is the real exposure, and it is closed deliberately.** A default paste
   into a contenteditable inserts the clipboard's `text/html` flavour —
   arbitrary attacker-authored markup (`<img onerror>`, `<iframe>`, `<script>`)
   dropped into the DOM by the browser, behind Vue's back. That is an injection
   sink by the back door and exactly what rule 8 exists to stop. So the paste
   handler `preventDefault()`s and inserts `clipboardData.getData('text/plain')`
   only. **`text/html` is never read.** A negative test asserts a paste carrying
   `text/html` yields text.

`domToBlocks` **reads** `nodeName`, `childNodes`, `textContent` and a whitelist of
`.ji-*` classes. Reading the DOM is not a sink, and any element the whitelist does
not name degrades to its `textContent` — so even if something unexpected reached
the tree it can only ever come back out as text.

The other seven: **not touched.** No IPC handler added or changed, no fs, no
crypto, no `shell.openExternal`, no new dependency, no network surface. The
renderer imports nothing from Node or Electron. Secret snippets keep their
guarantee — the editable host is behind the same `v-if="!masked"` that unmounts
Monaco, so masked plaintext is not sitting in the DOM.

## Test plan

Written before the code. Red → green on each, recorded.

- **unit** — `tests/renderer/utils/markdownSerialize.test.js`: every block and
  inline type to its marker; nesting depth → two-space indent (the `depthOf`
  contract, `markdownRender.js:64`); table alignment colons round-trip; `ins`
  degrades to text; empty tree → `''`.
- **unit** — `tests/renderer/utils/jiraSerialize.test.js`: `h2.`, `*`/`#` depth by
  **repetition** (`jiraRender.js:141`), `||head||`/`|cell|`, `{code}`, `{quote}`,
  and the inline set incl. `+ins+`, `-del-`, `{{mono}}`, `[label|href]` with the
  label-equals-href short form; empty tree → `''`.
- **unit** — `tests/renderer/utils/domToBlocks.test.js` (jsdom): each rendered
  shape read back to its block. Unknown element → `textContent` paragraph.
- **unit** — `tests/renderer/utils/serializeRoundTrip.test.js`: the property test
  that makes the set trustworthy — for **both** dialects,
  `serialize(parse(src)) === normalised(src)` over a fixture set, with the
  normalisation tables above asserted **explicitly** so a silent widening of the
  losses fails.
- **unit** — `tests/renderer/composables/useContentEditable.test.js`: caret offset
  survives a re-render; `text/html` paste yields plain text; Tab inside a list
  item indents and Shift-Tab outdents; Tab outside a list does not steal focus
  from the dialog.
- **e2e** — `e2e/rendered-editor.spec.mjs`, the user path from the repro, run for
  **both** dialects: new snippet → set syntax → type source in Plain → switch to
  Rendered → type into a heading → Plain view and saved content both carry it;
  press **Bold** in the toolbar while in Rendered; reopen the saved snippet and
  assert the text. Markdown additionally ticks a task checkbox → source becomes
  `- [x]`. Assertions are measured values (text content, a bounding box for the
  caret keyline), never a screenshot.
- **e2e** — a secret snippet in Rendered mode: masked shows no plaintext in the
  DOM.
- **red → green** — the checkbox case is the cheapest proof: assert a tick writes
  `- [x]` **before** removing `disabled` from `JiraRendered.vue:36`, watch it
  fail, then build.
- **seed fixtures** — none. `scripts/seed-local.mjs` needs no new entry: this
  changes a snippet-editor view, not a comparable file format, and both dialects
  are reachable by typing into a new snippet.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | line 58 sells "Markdown/Jira **preview**" and line 75 "the rendered form drawn beside the syntax". Both now understate it — the rendered form is editable in both dialects |
| `docs/screenshots/*.png` | **no** | the five captured states (`empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`) are the comparison surface. None shows the snippet editor, let alone its rendered view |
| `docs/roadmap.md` | **yes** | WYSIWYG snippet editing moves open → done. Mermaid node + a terse `Done.` bullet, no prose |
| `docs/brand/roadmap.svg` | **yes** | hand-authored twin of the same move — edited alongside, never generated |
| `docs/security.md` | **yes** | the plain-text-only paste rule is a rule-8 decision with a stated attack (`text/html` carrying `<img onerror>`). It belongs beside the other injection notes, or the next person restores the default paste |
| `docs/ipc-security.md` | **no** | no IPC handler added, changed or removed |
| `docs/glossary.md` | **no** | no new domain term — "rendered view" and "plain view" are already in use |
| `docs/standards.md` | **no** | no new convention. The composable-for-event-logic and pure-`utils/` rules are being *followed*, not extended |

## Implementation plan

- [x] 1. Branch `feat/editable-rendered-views` off `main`; record the token baseline.
- [x] 2. `tests/renderer/utils/markdownSerialize.test.js` — written first, watched red.
- [x] 3. `utils/markdownSerialize.js` — block tree → Markdown. Green.
- [x] 4. `tests/renderer/utils/jiraSerialize.test.js` — red.
- [x] 5. `utils/jiraSerialize.js` — block tree → Jira wiki markup. Green.
- [x] 6. `tests/renderer/utils/domToBlocks.test.js` — red.
- [x] 7. `utils/domToBlocks.js` — rendered DOM → block tree, whitelist-driven, unknown → text. Green.
- [x] 8. `tests/renderer/utils/serializeRoundTrip.test.js` — both dialects, normalisation tables asserted explicitly.
- [x] 9. `tests/renderer/composables/useContentEditable.test.js` — red, incl. the `text/html` paste negative.
- [x] 10. `composables/useContentEditable.js` — caret offsets, typing guard, plain-text paste, Tab/Shift-Tab. Green.
- [x] 11. `components/RenderedEditor.vue` + `styles/RenderedEditor.css` — `dialect` prop, the three token declarations from Design; `.vue` ≤ 250 / template ≤ 120 / script ≤ 100.
- [x] 12. `JiraRendered.vue` — task checkbox tickable behind an opt-in prop; the read-only previews and QuickLook keep today's inert box.
- [x] 13. `SnippetEditorDialog.vue` — mount `RenderedEditor` for `hasPreview && !plain && editMode && !masked`, passing the dialect; ungate `FormatToolbar` from `plain`; route toolbar actions through the editable's selection.
- [x] 14. `e2e/rendered-editor.spec.mjs` (both dialects) + the secret-snippet case.
- [x] 15. `make theme-sweep` — resolve the two **watch** rows (matrix tick, amber caret) against measured values; add the editable surface to `SURFACES`.
- [x] 16. Docs: `README.md` lines 58 + 75, `docs/roadmap.md`, `docs/brand/roadmap.svg`, `docs/security.md` paste note.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-17 | Full contenteditable WYSIWYG | The user was shown all three options with the trade-offs and chose it explicitly | click-a-block-to-edit; live split view |
| 2026-08-17 | **Jira editable too** | Asked for after the first draft scoped it out. The block tree and the renderer are already shared, so the marginal cost is one serializer, not a second implementation | Markdown-only |
| 2026-08-17 | One shared `domToBlocks`, two serializers | One renderer means one DOM shape to read. The dialects differ on structure (list depth by repetition vs indent, `{quote}` fence vs line prefix, alignment row), which a single marker-table function would express as `if (dialect)` in every branch | a single dialect-parameterised serializer |
| 2026-08-17 | New `RenderedEditor.vue`; the two preview components untouched | Both are also mounted by `QuickLookCompose.vue:119-120` beside its own textarea, where read-only is right. A flag on the shared component would put edit logic into the QuickLook path too | an `editable` prop on the previews |
| 2026-08-17 | DOM is the truth while typing; re-render only on external change | The caret-jump mitigation. Re-parsing on every keystroke resets the caret to offset 0 | re-render every keystroke |
| 2026-08-17 | Paste reads `text/plain` only, never `text/html` | Rule 8. Default contenteditable paste injects clipboard markup behind Vue's back | letting the browser paste natively |
| 2026-08-17 | `{code:java}` language hints stay lost | `parseJira:112-120` drops them before the tree exists — recovering them is a parser change, not a serializer one | widening `jiraRender.js` here |
| 2026-08-17 | Toolbar edits the DOM in the rendered view (`utils/domFormat.js`) | Discovered in build: `applySelectionEdit` is Monaco's, and Monaco is not mounted in the rendered view. A caret offset into RENDERED text does not map onto one into markup — `**bold**` is 8 characters and shows 4 — so there was nothing to hand the existing transforms | mapping rendered offsets back to source offsets |
| 2026-08-17 | `data-depth` on the rendered `<li>` | Depth was only recoverable from a `margin-inline-start` px value. Reverse-engineering a visual style is exactly the drift the band rules exist to stop; the attribute is inert in the read-only previews | parsing `(depth-1)*16` back out of the inline style |
| 2026-08-17 | View state + Monaco relayout extracted to `useSnippetEditorView` | The dialog's script block went 2 lines over its 100 cap. Raising a cap is not the fix, and "which view is showing, and keeping Monaco measured across the switch" is a cohesive unit that was inline event logic | shaving comments to fit |
| 2026-08-17 | `tableBlock`'s `!table` guard removed as dead code | `blockOf` only routes there when `querySelector('table')` is truthy, so the branch was unreachable — and unreachable code is an untestable branch that drags the coverage floor | keeping it "defensively" |
| 2026-08-18 | Both specs share `feat/editable-rendered-views` | The user chose it when asked, over committing spec 1 to isolate the branches. Deviates from the one-spec-one-branch rule and from each spec's own "two specs, two branches" decision — recorded here rather than left as drift | a branch per spec |
| 2026-08-17 | Two specs, two branches | Shares no file and no reason with `open-with-file-associations`; the skill's one-spec-one-branch rule | one combined spec |

## Validation

- [ ] `/validate` — outstanding
- [x] `npm run check` — **exit code 0**. Coverage 95.52 stmts / 88.53 branches / 96.06 funcs / 96.62 lines, over the 88% branch floor. Four cap failures were hit and fixed by extraction, never by raising a cap
- [x] `npm run check:i18n` / `check:rawtext` — pass inside `check`. One new key, `snippetEditorDialog.renderedEditor`; `en-XA.json` regenerated with `scripts/pseudolocale.mjs`
- [x] E2E seen running: **7/7 pass** — `E2E_HIDDEN=1 env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/rendered-editor.spec.mjs`. Covers both dialects, the checkbox, the toolbar, save-and-reopen, the secret mask, and read-only-until-Edit
- [x] `make theme-sweep` — **1560 measurements across 20 themes, all pass**. Both "watch" rows resolved from measured values:
      **amber caret** — `editable body` 12.93:1, and since `caret-color` is pinned to `--text` that ratio IS the caret's;
      **matrix tick** — not a measurable pair (`accent-color` hands the glyph to the UA), so resolved from the screenshot: `#00ff41` fill with a **black** tick, chosen on luminance. `nyan` checked too — magenta with a white tick. Worst text ratio across all 20 is sepia 9.77 (floor 4.5); worst quote ink sepia 3.93 (floor 3.0)
- [x] every Docs-impact "yes" done — README lines 58 + 75, `docs/roadmap.md` (new Snippets track), `docs/brand/roadmap.svg` (card 6, "Five tracks" → "Six"), `docs/security.md` (the paste rule, with the attack it closes)
- [ ] token usage measured, header row filled

**Note on the theme sweep's side effects:** running it rewrote all 340 existing
`docs/screenshots/themes/*.png` with byte-level noise unrelated to this change.
Those were reverted (`git checkout -- docs/screenshots/themes/`); only the 20 new
`rendered-editor-*.png` are kept.

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

**Outcome:**
