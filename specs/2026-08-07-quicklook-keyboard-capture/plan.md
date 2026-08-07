# Quick Look keyboard-only snippet capture

|                                         |                                          |
| --------------------------------------- | ---------------------------------------- |
| **Status**                              | shipped                                  |
| **Progress**                            | 12 / 12 steps                            |
| **Branch**                              | `improvement/quicklook-keyboard-capture` |
| **Started**                             | 2026-08-07                               |
| **Finished**                            | 2026-08-07                               |
| **Bugs found and fixed this iteration** | 3 / 3                                    |
| **Token baseline**                      | 2026-08-07T17:21:07Z                     |
| **Claude tokens used**                  | 47,768,243 (measured)                    |

## Problem

The launcher can find, preview and copy a snippet by keyboard. It cannot
**create** one.

1. **No key is bound to it.** `startCompose` has exactly one caller — the `+`
   button's `@click` at `QuickLookSearch.vue:44`. Nothing in `useQuickLookKeys`'
   `HANDLERS`, no row in `results`, no chip in `footHints`. A keyboard user has
   no way to learn it exists.
2. **Tab is hostile here by design.** The whole keyboard model hangs off the
   search input's `@keydown` (`QuickLook.vue:81-91`). The instant Tab lands on
   `.ql-add`, arrow navigation, Enter and `⌘C` die, and `reclaimKeyboard` only
   fires on `@click` — nothing hands the keyboard back.
3. **`.btn` has no `:focus-visible` rule** anywhere in `ui.css`, so even a
   successful Tab shows Chromium's UA ring rather than a designed stop.
4. **The language half is a wall.** `useQuickLookCompose.js:63` hardcodes
   `language: PLAINTEXT`. `snippetStore.add` already runs
   `detectSnippetLanguage(content)` (`:216`) and resolves
   `effectiveLanguage(language, detected)` (`:217`) — an explicit `'plaintext'`
   **beats** detection. The launcher computes the right language and discards
   it. Knock-ons: `formatTagFor` returns null so the snippet is never findable
   by "sql", and `canEditInline` (`useQuickLook.js:198`) refuses to reopen
   anything with a language.

Two defects found while researching, both latent until now:

- **`--font-mono` is undefined.** `QuickLookCompose.css:75` sets
  `font-family: var(--font-mono)`; that is the token's only mention in the whole
  repo. The compose textarea silently falls back to the inherited sans face and
  is not monospaced today. `check:styles` rejects hardcoded values, not
  undefined tokens, so nothing caught it.
- **The language chip fails the text floor on three themes.**
  `.ql-compose-lang` is `color: var(--accent)` at `--font-2xs`. Parsed from
  `themes.css` against each `--bg`: solar 3.52, meridian 3.88, sepia 4.35 — all
  under 4.5:1. Harmless while it says a decorative "Plaintext"; not once it
  names the language the snippet will actually be stored as.

## Solution

Three moves, in the order the keyboard meets them: a key, a row, and a compose
panel that shows what it is about to save.

- **`⌘/Ctrl+N`** opens compose from anywhere in the launcher and carries the
  query in as the **name**. You searched for a thing, didn't find it, and are
  now creating it; the body almost always arrives by paste. `⌘↵` to save
  already works (`QuickLookCompose.vue:25`). `⌘N` is unclaimed — verified
  against every `CmdOrCtrl+*` accelerator in `src/main/`.
- **A `kind: 'create'` row** appended to `results` when the query is non-empty.
  This is the discoverability fix and costs nothing structurally: another row
  the arrow keys already drive, rendered through the existing `.ql-res` markup.
- **Compose gains a language**: `'auto'` instead of `PLAINTEXT`, a native
  `<select>` replacing the static label, and a transparent-textarea + `<pre>`
  overlay that paints `miniLines()` output live as you type.

| option                                                          | why not                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make `Tab` reach `+` and restore focus after                    | Treats the symptom. The button is invisible to a keyboard user either way, and handing focus back after every Tab is a second focus model fighting the first. |
| `contenteditable` for the highlighted body                      | Preserving the caret across a re-render is the whole battle, and it loses native undo. A transparent textarea keeps undo, IME and spellcheck for free.        |
| Name it `rollback.sql`, let `EXT_TO_LANGUAGE` pick the language | Zero UI, but a hidden convention — and that map lives in `adapters/`, which a composable may not import.                                                      |
| Monaco in the launcher                                          | The window's whole value is appearing instantly on the shortcut. `miniHighlight.js` exists for exactly this reason.                                           |
| Infer the language and never offer an override                  | Detection is best-effort by its own comment. An explicit choice must be possible, and must never be overwritten by a later guess.                             |

## Scope

**In:**

- `⌘/Ctrl+N` in the launcher key driver, carrying the query as the name.
- `kind: 'create'` row in `results`, handled in `choose()`.
- `language: 'auto'` on the draft; `canEditInline` refuses only
  `secret` / `mermaid` / `claude`.
- Native `<select>` of `SNIPPET_LANGUAGES` (Auto default) replacing the static
  head label, restyled off the accent-as-text failure.
- Live highlighting in the compose body, in a new
  `composables/useHighlightedInput.js` with its own unit test.
- `--font-mono` and `--focus-ring` tokens; `.btn:focus-visible` in `ui.css`.
- `footHints` moved into the catalogue. It is already a standards violation
  (raw English in source) in the exact array this change edits — leaving half
  of it raw while adding to it is worse than fixing it.

**Out:**

- `previewHints` label IDs beyond what `footHints` needs — same file, but the
  preview zone is untouched by this change.
- The `+` button stays. It is the mouse affordance and nothing here replaces it.
- Tags in launcher compose. Still main-window work; unchanged.
- Reworking `reclaimKeyboard`. `⌘N` sidesteps it entirely.

## Design

Token-driven. Two new tokens in `tokens.css`, both structural:

- `--font-mono: ui-monospace, 'Cascadia Code', Consolas, monospace` — the exact
  stack already hardcoded elsewhere. The overlay needs both layers on identical
  metrics, which only a shared token can guarantee. (See the step-2 amendment:
  **33 files** repeat this literal, so folding them in is its own sweep.)
- `--focus-ring: color-mix(in srgb, var(--accent) 80%, var(--text))` — a bare
  `--accent` ring scores **2.58 on solar** and **2.98 on meridian** against
  `--bg-elevated`, under the 3:1 non-text floor. Mixing toward the ink is the
  trick `--btn-edge`, `--pin-ink` and `--dg-del` already use; at 80% the worst
  case across all 14 themes × 3 grounds is **3.34** (solar on elevated).

The compose head's language control: label in `--text`, accent as a
`--radius-pill` keyline at `--chip-h`. Accent-on-`--bg` as a **keyline** needs
3:1, and the weakest theme is solar at 3.52 — it passes as a rim where it failed
as ink. **Amended mid-build:** the plan also called for an accent dot. The
control became a native `<select>` (the only fully keyboard-navigable picker
with type-ahead), and a `::before` dot cannot be added to one without replacing
the native widget — which would cost exactly the keyboard behaviour it is there
for. The keyline alone carries the accent.

Overlay geometry: `white-space: pre` on both layers with a shared horizontal
scroll, not `pre-wrap`. Soft wrap has to break at the same character in both or
the lines drift, and `pre` is the right call for code anyway.

Syntax colours are the existing `--syn-*` on `--bg` — the same pairing the
preview pane already ships (`.ql-pv-body` inside `.ql-preview { background:
var(--bg) }`), so no new colour risk.

### Theme verdict — all 14

Values parsed from `styles/themes.css`. `acc/bg` is the language keyline;
`ring` is the worst of `--focus-ring` against `--bg` / `--bg-panel` /
`--bg-elevated`. Floors: 3:1 non-text, 4.5:1 text.

Every theme's worst ring ground is `--bg-elevated`, as expected — it is the
lightest-veiled surface a `.btn` sits on.

| theme    | ground | acc/bg   | ring worst | verdict | note                                                        |
| -------- | ------ | -------- | ---------- | ------- | ----------------------------------------------------------- |
| light    | light  | 5.18     | 4.69       | pass    | floating-canvas inversion; chip sits on `--bg-raised` white |
| dark     | dark   | 5.05     | 4.26       | pass    |                                                             |
| solar    | light  | **3.52** | **3.34**   | pass    | worst case for both — keyline only, never ink               |
| neon     | dark   | 10.74    | 7.61       | pass    | accent `#22d3ee`; keyline not glow, so no halo              |
| nord     | dark   | 6.24     | 4.06       | pass    |                                                             |
| sepia    | light  | 4.35     | 3.70       | pass    | fails as text (4.35 < 4.5), passes as keyline               |
| dim      | dark   | 7.79     | 5.87       | pass    |                                                             |
| beacon   | dark   | 10.47    | 8.40       | pass    | hard keyline `#e0e0e0` on `#000000` — nothing removes it    |
| meridian | light  | 3.88     | 3.75       | pass    | fails as text (3.88 < 4.5), passes as keyline               |
| linen    | light  | 6.38     | 5.42       | pass    |                                                             |
| bloom    | light  | 4.95     | 4.31       | pass    |                                                             |
| nyan     | dark   | 5.92     | 4.54       | pass    | accent `#ff2ecb`; flat rim, no accent-tinted glow           |
| matrix   | dark   | 14.68    | 10.50      | pass    | accent `#00ff41`; same                                      |
| contrast | light  | 8.54     | 7.44       | pass    | hard keyline `#111111` kept; ring is additive               |

The three that fail today (solar, meridian, sepia) fail as **text** and pass as
a **keyline** — which is the whole reason the fix is the repo's own rule
("the accent goes on the keyline and NEVER on the label") rather than a new
colour.

## Security rules touched

- **Rule 8 (no injection sinks)** — the one rule this comes near, and the reason
  `miniHighlight.js` returns tokens rather than markup. The overlay renders
  `<span :class="...">{{ span.text }}</span>` through text interpolation, the
  same as `QuickLook.vue:180-187`. No `v-html`, no `innerHTML`.
- **Rule 3 (renderer never touches Node/Electron)** — unchanged. Everything is
  renderer-side; the vault path is still `snippets.add` → `vault:encrypt`.
- **Rule 4 (keys never cross IPC)** — untouched, no new handler.
- **Rule 2 (new dependencies)** — none. Prism is already in the tree and already
  bundled into the launcher.
- Rules 1, 5, 6, 7 — not approached: no network, no sealing/crypto change, no
  new import surface, no `shell.*` call site.

One security-adjacent note: a **secret** snippet must not be highlighted or
reopened inline. `canEditInline` keeps refusing `secret`, and the overlay is
never mounted for one — its guarantee is that the contents do not get rendered
where they can be read.

## Test plan

Written before the code.

- **e2e** — `e2e/quick-look-keyboard.spec.mjs`: summon → type a non-matching
  query → `⌘N` → type SQL → `⌘↵` → the snippet exists, and its row carries the
  `sql` monogram. Asserts `.ql-add` is **never** used. Second case: the create
  row appears for a non-matching query and `Enter` on it opens compose. Third:
  after typing `SELECT …`, `.ql-compose-hl .syn-keyword` exists — the measurable
  thing, not a screenshot.
- **unit** — `tests/renderer/composables/useQuickLookKeys.test.js`: `⌘N` calls
  `onNew`; a live text selection still copies natively; `n` without a modifier
  does nothing.
- **unit** — `tests/renderer/composables/useQuickLookCompose.test.js`: the two
  existing assertions on `language: 'plaintext'` (`:32`, `:102`) become
  `'auto'` — red first, they are the guard that the draft actually changed.
  Plus: `start('deploy rollback')` seeds the name; an explicit language survives
  a later body change.
- **unit** — `tests/renderer/composables/useHighlightedInput.test.js`: scroll
  mirrors both axes; a trailing `\n` yields one extra line so the layers stay
  registered; `compositionstart` drops the overlay and `compositionend` restores
  it; a body over the cap falls back to one plain line.
- **unit** — `tests/renderer/composables/useQuickLook.test.js` (or the existing
  suite): the create row appears only for a non-empty query, sits last, and
  `choose()` on it opens compose with the query as the name.
- **red → green** — each of the six numbered problems gets its failing test
  watched first. Recorded per step below.
- **seed fixtures** — none. No new file format, no changed data shape;
  `seed-local.mjs` is untouched.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                      |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | **yes** | line 72 says "**+** captures a plaintext snippet" — both halves go stale (`⌘N` captures it, and it is no longer plaintext-only). Line 57's Quick look-up row too. |
| `docs/screenshots/*.png` | no      | the six captured states are all main-window (`empty-state`, `diff-*`, `save-encrypted`, `spreadsheet-diff`, `diagram-diff`). None frames the launcher.            |
| `docs/roadmap.md`        | no      | grep for "launcher" / "quick" returns nothing — the launcher has no roadmap track to move.                                                                        |
| `docs/brand/roadmap.svg` | no      | same reason.                                                                                                                                                      |
| `docs/*.md`              | no      | no IPC surface, no crypto change, no new term for the glossary, no standards rule added or altered.                                                               |

## Implementation plan

- [x] 1. **Failing e2e first.** `e2e/quick-look-keyboard.spec.mjs`, all three
      cases. Run it, record the failure — it cannot pass, there is no `⌘N`.
- [x] 2. **Tokens + focus ring.** `--font-mono` and `--focus-ring` in
      `tokens.css`; `.btn:focus-visible`. Confirms defects 5 and 3.
      **Amended mid-build:** the plan said `.monogram` would read the new font
      token. It turns out **33 files** hardcode that exact stack, so converting
      one is arbitrary and converting all is a repo-wide sweep unrelated to this
      feature. The token is defined and used by the code this change touches;
      the sweep is recorded as a follow-up instead.
- [x] 3. **`⌘N` in the driver.** `tryNew(e)` beside `tryCopy(e)` in
      `useQuickLookKeys`, new `onNew` option defaulted so existing tests hold.
      Unit test red → green.
- [x] 4. **Create row.** `compose` moves above `choose` in `useQuickLook`;
      `results` appends `kind: 'create'` for a non-empty query; `choose()`
      routes it to `compose.start(query)`; `start(name)` takes an initial name.
      Unit tests red → green.
- [x] 5. **Language on the draft.** `'auto'` instead of `PLAINTEXT`; `chosen` /
      `detected` / effective language in `useQuickLookCompose`, detection
      debounced and abandoned once the user picks explicitly — mirroring
      `useSnippetDraft.js:80`. The two existing `'plaintext'` assertions are the
      red.
- [x] 6. **`canEditInline`.** Refuse `secret` / `mermaid` / `claude`; allow the
      rest. Unit test red → green.
- [x] 7. **`useHighlightedInput.js`** + its unit test: scroll mirror, newline
      sentinel, composition swap, size cap.
- [x] 8. **`QuickLookCompose.vue`**: the overlay, the language `<select>`
      replacing the static label, and the restyled chip. Watch the 250/120/100
      caps — split a child component rather than raise one.
- [x] 9. **`footHints` into the catalogue.** New keys for the added hints, and
      the existing raw labels in that array with them.
- [x] 10. **i18n.** Retire `newPlaintextSnippet` /
      `captureANewPlaintextSnippet` (no longer true), add the create-row and
      language-select keys, `node scripts/pseudolocale.mjs`, then
      `npm run check:i18n` and `check:rawtext`.
- [x] 11. **README** lines 57 and 72.
- [x] 12. **Close.** `npx prettier --write` on touched files only,
      `npm run check`, e2e green on the host
      (`env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/quick-look*`), then
      `/validate`.

## Decisions

| date       | decision                                                                              | why                                                                                                                                                                                      | rejected                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 2026-08-07 | `⌘N` is **not** added to the application menu or `MenuBar.vue`                        | On macOS an app-menu accelerator fires whichever window has focus, so a menu entry would swallow the launcher's own key. The launcher's `⌘C` and `⌘↵` already live only in the renderer. | Registering it in both places, as the standards' shortcut rule normally requires — noted as the exception |
| 2026-08-07 | The create row sits **last**, not first                                               | Selection should stay on the best match; the row is for discovery and the mouse, since `⌘N` is the fast path from anywhere                                                               | Top placement, which steals the default selection from the match you were looking for                     |
| 2026-08-07 | The language `<select>` **replaces** the head chip rather than joining it in the foot | One control, not a chip and a picker saying the same thing. It keeps the language in the header where the label already was, so the contrast fix stays meaningful                        | Select in the foot band + a read-only chip in the head — redundant                                        |
| 2026-08-07 | `white-space: pre` + shared horizontal scroll, not `pre-wrap`                         | Two layers must break lines at the same character or they drift; `pre` removes the question, and it is the right mode for code                                                           | `pre-wrap` on both, which depends on two engines agreeing on break opportunities                          |
| 2026-08-07 | `footHints` translation is **in** scope                                               | It is raw English in source (a standards violation) in the exact array this change edits; adding a raw hint beside translated ones is worse than fixing the array                        | Leaving it and filing a follow-up                                                                         |
| 2026-08-07 | `previewHints` (in `utils/`) is **out** of scope                                      | `utils/` is pure and must export key IDs, so it is a wider change; the preview zone is not touched by this work                                                                          | Doing both at once and widening the diff                                                                  |

## Validation

Recorded as fact, not intention.

- [x] `/validate` — 3 bugs found and fixed, 3 pre-existing findings recorded;
      full report prepended to `quality-audit.md`
- [x] `npm run check` — **exit 0**. Coverage: statements 95.16% (floor 93),
      branches 88.1% (86), functions 95.9% (92), lines 96.15% (95).
      `structure: 384 files, 4 baselined cycles, 27 legacy size entries — clean`,
      `i18n: 1037 keys, 1037 used — clean`, `theme depth ok (14 themes)`
- [x] UI seen running — 28/28 launcher e2e on the macOS host
      (`quick-look`, `quick-look-convert`, `quick-look-keyboard`). The full host
      suite is 340/62/1, and **all 62 failures reproduce on a clean `main`
      worktree** (`openMenu` → menubar timeouts); none is a Quick Look spec.
      Recorded as finding 3. `make e2e` in Docker is the canonical full run.
- [x] Docs — README lines 57 and 72 updated. Screenshots, roadmap and `docs/*.md`
      verified unaffected, with reasons in the table above.
- [x] `make local-seed` — n/a, no fixture change
- [x] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category    |     tokens |
| ----------- | ---------: |
| input       |        276 |
| output      |    107,194 |
| cache write |    190,719 |
| cache read  | 47,470,054 |
| **total**   | 47,768,243 |

148 requests over 2026-08-07T17:21:15Z → 18:50:33Z, all of it this feature — the
session did not wander onto other work inside the window. Cache read is 99.4% of
the total, so this is tokens _processed_, not a bill.

**Outcome:** Shipped. The keyboard path works end to end — summon, type, `⌘N`,
paste, `⌘↵` — and the body is syntax-coloured as it is typed, in whatever
language the store will actually store it as. Three latent defects surfaced and
were fixed on the way: a crash the create row triggered in the preview pane, an
undefined `--font-mono` token, and a missing `:focus-visible` on every button in
the app. Three ratchet entries moved down; none was raised.
