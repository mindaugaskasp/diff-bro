# Start surface, snippets as tabs, Keys in the rail

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 13 / 13 steps |
| **Branch** | `feat/start-surface-snippet-tabs-keys` |
| **Started** | 2026-10-23 |
| **Finished** | 2026-10-23 |
| **Bugs found and fixed this iteration** | 13 / 13 |
| **Token baseline** | 2026-10-23T09:18:05Z |
| **Claude tokens used** | 173,233,410 (cache read 172.7M, output 191k), 09:18Z → 11:00Z |

Designs: start surface + snippet tab — https://claude.ai/artifact/FX5YMsjo6naXChKJaZi48P
(D1 with the tab removed, S1, S1 + history); Keys — https://claude.ai/artifact/HL2xxFy4hYCtqThga7wkD2 (B).

## Problem

1. **The empty main view is a dead end.** `App.vue:163` shows "Choose or drop
   two files to compare.", a chip cloud of formats and a floating shortcut bar.
   It offers no way to start anything except the file slots above it, and
   nothing from the library. The blank tab it lives in reads "Untitled",
   which looks like an unfinished piece of work rather than a place to start.
2. **Snippets edit in a modal.** `SnippetEditorDialog.vue` covers the diff you
   came from. Only one snippet can be open at a time. History is a second
   dialog on top of the first (`SnippetHistoryDialog.vue`). A long snippet gets
   a dialog-sized editor in an app that has a full-height main area doing
   nothing.
3. **The key buttons carry no state.** `KeyActions.vue` is two actions, "My
   key" and "Trusted key", floating above the sidebar column. Nothing shows
   whether you have ever swapped keys or with whom. Seeing or removing trusted
   keys is only in the Security menu (`commands.js:101`, `manage-keys`).

## Solution

- **Start surface (D1, no tab).** A blank active tab is drawn as a start
  surface instead of an empty comparison, and the strip hides blank tabs: the
  surface is not a tab of work. The `+` button shows a pressed state while the
  surface is showing, and it is what brings the surface up. A blank tab already
  exists by construction (`tabsStore` keeps one), so no "zero tabs" state is
  introduced. The surface has three start cards: **Two files** (⌘1/⌘2),
  **Pasted text** (⌘T) and **New snippet**. Below them, "Pick up where you
  left off" lists recent items (`sidebarRecent`), then one quiet line of
  formats. The floating shortcut bar is hidden on the surface.
- **Snippets as tabs (S1).** A tab gains a `kind`: `'diff'` (today) or
  `'snippet'`. A snippet tab renders a `SnippetDocument` in the main area: a
  header band (name, syntax, tags, Secret, Plain/Rendered, **Compare with…**,
  History, a ⋯ menu, Save ⌘S) over a full-height editor. History docks beside
  the document. Dirty drafts show the tab's unsaved dot and use the tab-close
  confirm. **Compare with…** opens a new diff tab with this snippet on the left,
  and the right side is chosen from another snippet, the clipboard or a file.
  Every place that opened the dialog opens a tab instead.
- **Keys in the rail (B).** A **Keys** rail item is pinned to the bottom of the
  rail, with the trusted-key count as its pill. The Keys panel has a "Your key"
  card (identicon, fingerprint, Email / Copy / Save) and the trusted list,
  reusing `TrustedKeyRow` with its email/rename/remove actions plus Add. Before
  any swap, a two-step guide replaces the list. `KeyActions` leaves the
  toolbar. `manage-keys` and both Security-menu items open the panel.

| option | why not |
|---|---|
| D2 drop panes | owner picked D1 |
| start surface as a tab | owner: it must read as a start screen, not work |
| allow zero tabs | `diffStore` always mirrors the active tab; zero tabs breaks that invariant everywhere. A hidden blank tab gives the same UX |
| S2 snippet drawer | editing cramped; owner picked S1 |
| A identity chip / C split control | owner picked B |
| a new IPC for the identity card | everything needed is already exposed: `myFingerprint`, `myKeyLabel`, `emailKey`, `copyPublicKey`, `exportPublicKey`, `listTrustedKeys`, `addTrustedKey`, `removeTrusted` |

## Scope

**In:** start surface; snippet tabs (new, view, edit, history, compare-with,
secret masking, rendered editing, Mermaid preview, format, copy, copy as file,
capture, clear, delete); Keys rail item + panel; identicon; routing every
snippet-open path to tabs; tour steps; session restore of snippet tabs by id.
Home delete (already built on this branch, validated: 542/542 e2e) lands as its
own commit in the same PR.

**Out:**
- The quick look-up launcher's compose card stays as it is (separate window).
- A new snippet's unsaved draft is **not** restored after a relaunch: its
  plaintext would have to sit in the session store, and a secret's promise is
  that it lands nowhere readable. Closing or quitting with a dirty draft asks
  first.
- Received-diff handling, key rotation UI and the trust dialog's naming step
  are unchanged; the panel launches them.

## Design

Tokens only: `--bg-card`, `--line`, `.tile`, `.glyph-well[data-hue]`, `.row-2`,
`--text-meta`, `--row-hover`, `--select-wash`, `.btn` / `.btn-primary`,
`--control-h` / `--control-h-sm` / `--chip-h` / `--rail-item`, `.band`,
`--shadow-1`. Identicon cells reuse the `secure` hue (`--well-secure` /
`--glyph-secure`). Start-card wells: `diff`, `received`, `snippet` hues.

### Theme verdict — all 20

Pairs computed from `themes.css` values for the B card + rail, and for the S1
header + start cards (the same token roles as the sweep boards on the canvases).

| theme | ground | verdict | note |
|---|---|---|---|
| light | light | pass | card = `--bg` |
| dark | dark | pass | |
| solar | light | pass | Save label 4.53 on `--accent` |
| neon | dark | pass | accent `#22d3ee` used as a bar and fill only, never glow |
| nord | dark | pass, tightest | trusted initials 4.67, identicon 4.75, tag 4.65, card edge 3.35 |
| sepia | light | pass | |
| dim | dark | pass | |
| beacon | dark | pass | `--line` = hard keyline `#e0e0e0` |
| meridian | light | pass | Save label 4.52 |
| linen | light | pass | |
| bloom | light | pass | |
| nyan | dark | pass | accent `#ff2ecb` bar only |
| matrix | dark | pass | accent `#00ff41` bar only |
| contrast | light | pass | `--line` = hard keyline `#111111` |
| volcano | dark | pass | `--line` = `--border` |
| amber | dark | pass | |
| tide | dark | pass | |
| ember | dark | pass | |
| graphite | dark | pass | |
| vector | light | pass | |

The theme sweep re-measures the built surfaces (step 11); the canvas numbers
are a prediction, not the proof.

## Security rules touched

- **3 renderer/main:** no new IPC; the panel calls existing `window.api` share
  methods.
- **4 keys:** the identicon is drawn from the public fingerprint, which the
  renderer already has; no key material.
- **7 sandbox exits:** Email my key uses the existing confirmed `mailto:` path
  (`mail.js`); no new exit.
- **Secret snippets:** a snippet tab of a secret opens masked; reveal is
  per-open and resets when the tab closes. The tab title never shows content
  (`firstLineOf` is not used for snippet tabs). A snippet draft is never
  written to the session store.

## Test plan

- **unit:**
  - `tests/renderer/utils/tabs.test.js`: `kind`, snippet-tab titles never come
    from content, and blank tabs are hidden from the strip list.
  - `tests/renderer/utils/session.test.js`: snippet tabs persist as `{kind, id}`
    only; a draft-only tab is dropped.
  - `tests/renderer/utils/identicon.test.js`: deterministic, mirror-symmetric,
    never an empty or full grid.
  - `tests/renderer/stores/tabsStore.test.js`: open a snippet tab, focus an
    existing one instead of duplicating, and a dirty close asks.
  - `tests/renderer/composables/useHomeActions.test.js`: opening a snippet
    opens a tab.
- **e2e:**
  - `start-surface.spec.mjs`: no tab drawn, + pressed, each card starts the
    right thing, recent opens.
  - `snippet-tab.spec.mjs`: new, edit, save, dirty dot, close asks, history
    docked, Compare with… opens a diff tab, secret masked.
  - `keys-panel.spec.mjs`: count pill, your fingerprint, Add flow, remove asks,
    and toolbar buttons gone.
  - About 31 specs that drive the snippet dialog are moved to the tab (shared
    helper in `fixtures.mjs`).
- **red → green:** any bug found on the way gets its test failing first.
- **seed fixtures:** none: no new format.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | yes | Snippets row (open as tabs, history beside), Share row (Keys panel), empty-state description |
| `docs/screenshots/*.png` | yes | `empty-state` becomes the start surface; every frame with the toolbar loses the key buttons |
| `docs/roadmap.md` | yes | Snippets track: "Snippets open as tabs" done |
| `docs/brand/roadmap.svg` | yes | same move |
| `docs/*.md` | no | no security posture or IPC changes; glossary has no "start surface" entry needed |

## Implementation plan

- [x] 1. Commit Home delete (already green) as its own commit on this branch.
- [x] 2. Tab model: `kind`, snippet tab payload, titles, strip hides blank tabs;
      session stores snippet tabs by id. Unit tests first.
- [x] 3. Start surface component, wired on a blank active tab; + pressed state;
      hide shortcut bar there.
- [x] 4. `SnippetDocument`: lift the dialog's body into a main-area view over
      the existing `useSnippetDraft`, keyed per tab; header band per S1.
- [x] 5. History docked beside the document; Compare with… flow.
- [x] 6. Route every snippet-open path to a tab (rows, Home, preview card,
      CLI `create snippet`, tour, palette); retire `SnippetEditorDialog` and
      `SnippetHistoryDialog`.
- [x] 7. Tab close / quit: a dirty snippet asks first.
- [x] 8. Identicon util + component; Keys rail item + panel; reuse
      `TrustedKeyRow`; remove `KeyActions`; route `manage-keys`.
- [x] 9. Tour steps that pointed at the dialog or the key buttons.
- [x] 10. e2e: three new specs; move dialog-driven specs to the tab.
- [x] 11. Theme sweep surfaces `start-surface`, `snippet-tab`, `keys-panel`
      (all 20); fix anything under floor.
- [x] 12. Docs and screenshots (all "yes" rows).
- [x] 13. `/validate`, `npm run check`, `make e2e`, then the PR.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-23 | D1 start surface, not drawn as a tab; + brings it up | owner | D1 as a tab, D2 |
| 2026-10-23 | the start surface is the hidden blank tab | keeps `diffStore`'s one-active-tab invariant | zero-tab state |
| 2026-10-23 | third start card is **New snippet**, not "Two snippets" | the canvas's "Two snippets" had no real entry point (it said "drag"); New snippet is a real action and leads into S1 | a snippet-pair picker (new UI for little gain) |
| 2026-10-23 | S1 snippets as tabs with History docked | owner | S2 drawer |
| 2026-10-23 | B Keys in the rail | owner | A, C |
| 2026-10-23 | Home delete ships in this PR as its own commit | it was built on this branch and touches the same Home panel | a separate PR |
| 2026-10-23 | unsaved new-snippet drafts are not restored across relaunch | a draft's plaintext in the session store breaks the secret-snippet promise | persisting drafts |
| 2026-10-23 | the start surface drops "Pick up where you left off" | the sidebar's Home shows the same Recent list beside it; two copies on one screen also made every name ambiguous (≈40 e2e strict-mode failures were the symptom, not the reason) | keeping both lists |
| 2026-10-23 | the file-slots row stays above the start surface | it is the comparison's own header, the drop target the tour points at, and what ⌘1/⌘2 fill; "Two files" stays as the large start | hiding it on the surface (D1 as drawn) |
| 2026-10-23 | the Keys panel's Email / Copy / Save open the naming dialog until your key has a name | a key leaves with a label; the toolbar's "My key" asked for one first, and the panel must not silently drop that | sending an unnamed key |
| 2026-10-23 | snippet documents mount per open tab (`v-for` + `v-show`), not under `<KeepAlive>` | a KeepAlive keyed by tab id keeps a CLOSED tab's editor and Monaco model cached | `<KeepAlive :max>` |
| 2026-10-23 | `tabsStore` close / closeMany moved into `tabClosing.js` | the store was at its 295-line ratchet; it is now 249 and its entry is gone | raising the cap |
| 2026-10-23 | `e2e/collapsed-rail-toolbar.spec.mjs` removed | it guarded only the key pair's position, and the pair is gone | — |

## Validation

- [x] `/validate`: new-file and diff comments trimmed to one-line whys.
      Conventions clean: lint, caps, structure (two ratchet entries removed,
      tabsStore 295 → 248). Security unchanged: no new IPC, no injection sinks,
      snippet drafts never reach the session store.
- [x] `npm run check`: exit 0. 3857 passed / 2 skipped, coverage 95.37 /
      88.45 / 95.96 / 96.4, theme depth ok on 20 themes, i18n 1383/1383.
- [x] UI seen running:
      - `make e2e`: 550 passed, 0 failed, 4 skipped. The affected specs
        re-ran green on the host after the last CSS fixes (50/50).
      - Theme sweep (start-surface, snippet-tab, keys-panel, sidebar-home):
        460 measurements on 20 themes, all above floor.
      - Screenshots regenerated and checked.
- [x] Docs:
      - README rewritten to 89 lines for non-technical readers, at the
        owner's request; the detail moved to `docs/features.md`, and the
        Docker setup to `docker/README.md`.
      - Roadmap entry and board card done.
- [x] token usage measured.

**Bugs found and fixed, each red → green (unit or e2e):**
1. `showStart` read the active tab's stale copy and "returned" to a live comparison.
2. Closing a lone snippet tab blanked it in place, so the document never left.
3. The strip judged the active tab by its stale copy: a comparison built on
   the start surface never appeared as a tab.
4. Opening a snippet replaced a comparison built on the start surface (the
   same stale read), so the comparison was lost.
5. A tab that appeared without its id changing was never scrolled into view.
6. A saved secret stayed revealed in its tab; reopening always masked it.
7. A saved Markdown or Jira snippet stayed on its raw editor, where a fresh
   open is rendered.
8. A row's hover preview covered the document of the snippet it previews.
9. The bigger name font reached the input only, so the completion ghost
   drifted off the caret.
10. The identicon cells collapsed to nothing in a centring well.
11. A trusted key's fingerprint ran under the row's buttons in the panel.
12. Snippet name (view mode) and editor header fell to 2.82–4.37 on up to
    13 themes; `--text-meta` / `--text` now.
13. Returning to a comparison from a snippet lost the place in it; each tab
    now keeps its scroll.

Also prevented, before it shipped: the tour demo reusing the start tab would
have left its "don't restore" flag on the reader's next comparison.

**Outcome:** shipped.
- **Start surface:** blank comparisons draw as a start surface; `+` returns
  to it.
- **Snippets as tabs:** snippets open as tabs with History docked and
  Compare with….
- **Keys in the rail:** a Keys panel replaces the toolbar's key buttons.
- **Home delete:** rides along as the first commit.
