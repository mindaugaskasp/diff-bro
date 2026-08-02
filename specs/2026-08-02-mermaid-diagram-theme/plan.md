# Diagram theme, independent of the app theme

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 11 / 11 steps |
| **Branch** | `feat/diagrams-snippets-rail` (one commit per spec; planned as `feat/mermaid-diagram-theme`) |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-08-02T10:25:22Z |
| **Claude tokens used** | 17,191,700 (mostly cache read) |

## Problem

A diagram's theme is welded to the app's: `mermaidThemeFor(appTheme)`
(`utils/mermaid.js:86`) returns Mermaid's `dark` for the seven dark-ground
themes and `default` for the seven light ones, and `MermaidDiagram` re-renders
whenever `diff.theme` changes (`MermaidDiagram.vue:70`). There is no way to say
"this diagram, light" while working in a dark app.

Two things make that a real cost rather than a preference:

1. **Mermaid's own palette is tuned for light.** Its `default` theme is the one
   its docs, its playground and every diagram people have seen are drawn in;
   `dark` is a re-tint. Someone reading diagrams all day in `dim` or `nord` is
   reading the worse of the two.
2. **The diagram is the export.** The snippet-screenshot spec
   (`specs/2026-08-02-snippet-screenshot/`) photographs the rendered diagram for
   pasting into a ticket, and a ticket wants a light diagram whatever the app
   is wearing. Today that shot would come out dark for anyone on a dark theme,
   with no control to change it.

The blocker is not the mermaid theme name — it is the ground under it.
`MermaidPreview.css:20` already records why: the diagram renders on `--bg`
because "`--bg` is the plain light/dark ground Mermaid's themes are tuned for".
Force the diagram light while `--bg` is `#0d1117` and the diagram's dark text
lands on a dark ground — unreadable. A theme override without its own paper is
not a feature, it is a bug.

## Solution

A three-state preference — **Auto · Light · Dark** — resolved by a pure helper
and honoured by `MermaidDiagram`, which is the single component behind every
diagram surface (editor preview, hover card, full viewer, and the screenshot
stage once it lands).

```
settings.diagramTheme  'auto' | 'light' | 'dark'
        │
        ├─ effectiveDiagramMode(appTheme, pref) → 'light' | 'dark'
        │        auto → isDarkTheme(appTheme) ? 'dark' : 'light'
        │
        ├─ mermaidThemeFor(mode) → 'default' | 'dark'      (what Mermaid renders)
        └─ diagramPaperFor(appTheme, pref) → '' | 'light' | 'dark'
                 '' when the mode agrees with the app's ground → keep --bg
                 otherwise the diagram gets its OWN paper
```

**The paper is the whole design.** When the resolved mode agrees with the app's
ground, nothing changes — `--bg` stays the ground, and every existing surface
renders pixel-for-pixel as it does today. Only a *mismatch* paints
`--diagram-paper-light` / `--diagram-paper-dark`: a fixed sheet the diagram sits
on, so a light diagram in a dark app reads as a diagram on paper rather than as
dark text on a dark wall.

| option | why not |
|---|---|
| Two states (Light / Dark), no Auto | drops "follow the app", which is the current behaviour and the right default for anyone who likes their theme's diagrams |
| Force the diagram light everywhere, no preference | it is a real preference — the dark themes exist because people want them, and a white slab in `matrix` or `nyan` should be opted into |
| Per-snippet theme, stored on the entry | a diagram's colours are a viewing choice, not a property of the snippet; it would also need a migration and a second control on every row |
| Paint the paper always (even when the mode agrees) | changes today's rendering on `sepia` (`#e9dcbe`), `solar` (`#fffdf6`) and every other tinted light ground for no gain, and `MermaidPreview.css:20` documents why the diagram sits on `--bg` |
| Only re-theme the full viewer | the hover card and the editor preview are where a diagram is actually read, and the screenshot stage would be left following the app theme |

## Scope

**In:** the persisted preference (defaults, validation, backup round-trip, its
setter); the three pure helpers; `MermaidDiagram` resolving the mode,
re-rendering when it changes, and painting its own paper on a mismatch; a
`SegmentedControl` in the editor's preview head and in the full viewer's
toolbar; the two paper tokens.

**Out:**

- **Per-snippet themes**, and any change to Mermaid's own palettes (node fill,
  edge colour). This picks between the two themes Mermaid ships; it does not
  author a third.
- **A Settings-dialog entry.** The control lives where diagrams are; a second
  copy in Settings is one more thing to keep in step.
- **The screenshot stage.** It does not exist yet — the snippet-screenshot spec
  is built next and will read this preference directly, which is why this one
  goes first.
- **Monaco / app-theme behaviour.** `isDarkTheme` keeps its meaning; only the
  diagram's own mode is overridable.

## Design

The control is the repo's existing one-of-N primitive — `SegmentedControl`
(`options: [{value,label}]`, `v-model:value`), which already styles itself from
`--bg-elevated` / `--border` / `--accent` / `--text-on-accent`.

```
Editor preview head (MermaidPreview.vue)
┌──────────────────────────────────────────────────────────────┐
│ Diagram preview      [ Auto │ Light │ Dark ]      [⤢ Expand] │   .mmd-preview-head
├──────────────────────────────────────────────────────────────┤
│  paper (only when the mode disagrees with the app ground)     │
│    ┌────────────────────────────────────────────────┐         │
│    │            the diagram, on its own sheet        │        │
└──────────────────────────────────────────────────────────────┘

Full viewer toolbar (MermaidViewerDialog.vue .tools)
  [−] 100% [+] [Fit] [ Auto │ Light │ Dark ] [⛶] [✕]
```

- **Two new tokens, deliberately theme-independent**, in `themes.css` `:root`
  and never overridden by a theme block — the point is that they do not move
  with the palette: `--diagram-paper-light: #ffffff` (Mermaid's `default` is
  drawn for white) and `--diagram-paper-dark: #161b22` (the ground its `dark`
  theme is tuned against, matching the dark theme's `--bg-panel`). A terse
  comment says why they are exempt from the per-theme rule. No literal enters
  `components/styles/`, so `check:styles` stays green.
- The paper carries `border-radius: var(--radius)` and sits inside the box that
  already has the `--border` keyline, so no theme loses an edge — `contrast`
  (`#111111`) and `beacon` (`#e0e0e0`) keep theirs untouched.
- `.tbtn` in the viewer toolbar is 24px; `.seg-opt` at `--font-sm` +
  `--space-1` padding is taller. If they do not line up, `SegmentedControl`
  gains a `compact` prop (its own component, one modifier) — **not** a scoped
  copy of `.seg` in the viewer, which is exactly the drift the standards call
  out. The band stays flex-centred either way.

### Theme verdict — all 14

Values parsed from `styles/themes.css`. With `auto` (the default) **every theme
renders exactly as it does today** — the helper returns `''` for the paper and
the diagram keeps `--bg`. The column below is the interesting case: what the
user sees after forcing **Light** on that theme.

| theme | ground | verdict | note (forced Light) |
|---|---|---|---|
| light | light `#ffffff` | pass | no-op — the mode already agrees, paper stays `--bg` |
| dark | dark `#0d1117` | pass | white sheet inside the existing `#30363d` keyline; the case this feature exists for |
| solar | light `#fffdf6` | pass | no-op; forced Dark would give a `#161b22` sheet on warm paper |
| neon | dark `#090d18` | pass | sheet is a bright block on a very dark ground — opted into, and bounded by `#26344f` |
| nord | dark `#2e3440` | pass | lowest-contrast dark ground; the sheet reads cleanly against `#4c566a` |
| sepia | light `#e9dcbe` | pass | no-op — and this is the theme that argues against always painting the paper |
| dim | dark `#1b1917` | pass | warm dark ground, neutral sheet — no tint clash, Mermaid's default is achromatic |
| beacon | dark `#000000` | pass | `#e0e0e0` hard keyline is untouched; sheet sits inside it |
| meridian | light `#f5f7f4` | pass | no-op |
| linen | light `#faf7f0` | pass | no-op |
| bloom | light `#f9f4f5` | pass | no-op |
| nyan | dark `#160a20` | pass | `#7a3fa6` border frames the sheet; accent `#ff2ecb` is only on the picked segment, no glow |
| matrix | dark `#020a04` | pass | biggest jump in the set (near-black → white). Deliberate and opt-in; the `#1f7a3a` keyline still frames it |
| contrast | light `#ffffff` | pass | no-op; the `#111111` keyline is untouched either way |

The `SegmentedControl` itself is unchanged and already ships on all 14.

## Security rules touched

None of the eight. No IPC, no fs, no crypto, no new dependency, no external
link, no injection sink — `MermaidDiagram` keeps adopting a parsed `<svg>` with
`replaceChildren`, and Mermaid stays at `securityLevel: 'strict'`. The
preference is a non-secret organizational setting, which is exactly what
plaintext `settings.json` is for.

## Test plan

- **unit — `tests/renderer/utils/mermaid.test.js`**
  - `effectiveDiagramMode`: `auto` follows `isDarkTheme` for all 14 theme ids;
    `light` / `dark` win over the app theme; an unknown stored value falls back
    to `auto`'s answer.
  - `mermaidThemeFor(mode)`: `light → 'default'`, `dark → 'dark'`.
  - `diagramPaperFor`: `''` whenever the resolved mode agrees with the app's
    ground (all 14 under `auto`, plus the agreeing explicit cases) and the mode
    itself on a mismatch. This is the test that pins "nothing changes by
    default".
- **unit — `tests/renderer/stores/settingsStore.test.js`**
  - defaults to `'auto'`; the setter persists; a hand-edited garbage value reads
    back as `'auto'`; it survives the persist → `readState` round-trip (the
    field is in both `DEFAULT_SETTINGS` and `persist()`, which is where a new
    setting is usually half-added).
- **e2e — `e2e/mermaid-theme.spec.mjs`** (new)
  - on a dark theme, forcing Light re-renders the diagram: the paper's computed
    `background-color` is the light token and the SVG's node text resolves to a
    dark fill — measurable properties, not a screenshot.
  - the preference survives a relaunch (settings are persisted through the
    preload boundary, which only a real launch exercises).
  - back on `Auto`, the computed ground is `--bg` again — proving the no-op path
    really is a no-op.
- **red → green** — the util tests are written first and watched failing (the
  helpers do not exist); the settings test fails on the missing key.
- **seed fixtures** — none. No new format, no changed data shape.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | **yes** | the Snippets feature row (line 56) lists "live Mermaid"; it gains that diagrams can be read light or dark independently of the app theme — a user-visible feature-status change |
| `docs/screenshots/*.png` | no | none of the five captured states (`empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`) shows a diagram surface |
| `docs/roadmap.md` | no | closes no tracked item and opens no track |
| `docs/brand/roadmap.svg` | no | board unchanged |
| `docs/*.md` | no | no IPC (`ipc-security.md`), no crypto or trust change (`security.md`), no new term worth a glossary entry, and the token exemption is explained in `themes.css` itself rather than as a new rule in `standards.md` |

## Implementation plan

- [x] 1. Branch `feat/mermaid-diagram-theme` off `main`, record the token baseline.
- [x] 2. `mermaid.test.js`: `effectiveDiagramMode`, `mermaidThemeFor(mode)`,
      `diagramPaperFor` — watch them fail.
- [x] 3. Implement the three helpers in `utils/mermaid.js`; `mermaidThemeFor`
      changes from *app theme* to *mode* and its one caller
      (`composables/useMermaid.js` / `MermaidDiagram`) moves with it; green.
- [x] 4. `settingsStore.test.js` (red) → `diagramTheme` in `DEFAULT_SETTINGS`,
      `readState` validation, `persist()` and `setDiagramTheme` (green).
- [x] 5. `--diagram-paper-light` / `--diagram-paper-dark` in `themes.css`.
- [x] 6. `MermaidDiagram`: resolve the mode, re-render when it changes, set
      `data-paper`, and paint the paper in `MermaidDiagram.css`.
- [x] 7. `MermaidPreview` head: the `SegmentedControl`.
- [x] 8. `MermaidViewerDialog` toolbar: the same control, with a `compact` prop
      on `SegmentedControl` if the 24px `.tbtn` row needs it.
- [x] 9. `e2e/mermaid-theme.spec.mjs`; run `make e2e`.
- [x] 10. README Snippets row.
- [x] 11. `npx prettier --write` on touched files, `npm run check`, `/validate`.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | The paper is painted ONLY when the resolved mode disagrees with the app's ground | keeps every existing surface pixel-identical under the default, and honours the reason `MermaidPreview.css:20` puts the diagram on `--bg` | always painting a fixed sheet, which would re-ground `sepia`, `solar` and the other tinted light themes for nothing |
| 2026-08-02 | The two paper tokens live in `themes.css` `:root` and are never overridden per theme | they are the one colour pair that must NOT move with the palette — that is the whole point of an override — and a literal in `components/styles/` would fail `check:styles` | a `/* token-exempt */` literal in the component's CSS |
| 2026-08-02 | Three states with `auto` as the default | `auto` is today's behaviour, so nobody's app changes under them; Light is one click for the people who want it | defaulting to Light, which would silently re-theme every dark-theme user's diagrams |
| 2026-08-02 | `mermaidThemeFor` is re-signatured to take a MODE, not an app theme | two near-identical functions (`…For(appTheme)` and `…ForMode(mode)`) is exactly the drift this repo keeps paying for; there is one caller | adding a second function beside it |
| 2026-08-02 | The preference is global, in `settingsStore` | one control, one value, every diagram surface honours it — including the screenshot stage that lands next | per-snippet storage |
| 2026-08-02 | Built BEFORE the snippet screenshot | otherwise the stage ships reading `diff.theme` and is immediately edited again; the picture is the main reason this preference matters | building the screenshot first and revisiting it |

## Validation

- [x] `npm run check` — `style tokens ok (90 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `114 passed | 1 skipped` files,
      `1683 passed | 2 skipped` tests, coverage floors held
- [x] e2e — `e2e/mermaid-theme.spec.mjs` 2 passed; the FULL suite re-run after
      the toolbar change: `263 passed, 2 skipped` (6.2 m), no regression in
      `mermaid.spec.mjs` / `mermaid-viewer.spec.mjs` / `settings.spec.mjs`
- [x] UI seen running (Docker screenshots): forced Light on `dark`, `matrix`,
      `beacon`, `nyan`; forced Dark on `contrast`, `sepia`; plus the editor
      preview head on `dark` and `contrast`. Keylines intact, control fits both
      rows, paper reads as a sheet on every one
- [x] README Snippets row updated
- [x] `make local-seed` — n/a, no format or data-shape change
- [x] token usage measured

**Red → green recorded:** `mermaid.test.js` 5 failures
(`effectiveDiagramMode`/`diagramPaperFor` undefined) → 15 passed;
`settingsStore.test.js` `expected undefined to be 'auto'` → 35 passed. The e2e
also failed once for real (`TypeError: Cannot read properties of null`) — a
label's `fill` resolves to a keyword mid re-render — and was fixed by making the
probe return null and polling on a composed boolean.

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since 2026-08-02T10:25:22Z
```

Measured over 75 requests, 2026-08-02T10:25:26Z → 10:45:37Z. The window is this
feature only; the snippet-screenshot spec was written before the baseline.

| category | tokens |
|---|---:|
| input | 141 |
| output | 42,254 |
| cache write | 85,906 |
| cache read | 17,063,399 |
| **total** | **17,191,700** |

**Outcome:** shipped as planned. The only design change during the build was
where the paper is painted — on `.host` rather than on `.mermaid-diagram`, so
the error card and its `--text`/`--danger` colours never land on a sheet of the
opposite polarity. One extra assertion beyond the plan: the label-ink-to-paper
contrast ratio (> 4.5), because "the colour changed" is not the property this
feature is for.
