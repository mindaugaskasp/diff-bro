# One vocabulary for labels, and grouped menus

| | |
|---|---|
| **Status** | in-progress |
| **Progress** | 0 / 2 slices |
| **Branch** | one per slice; see Delivery |
| **Started** | 2026-10-27 |
| **Finished** | — |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-10-27T20:50:02Z |
| **Claude tokens used** | — |

## Problem

Issue #111. One act wears several names, and menus sit beside buttons that say
something else:

- **One mode, three names:** Paste Text Mode (menu), Paste text mode, Paste mode
  (toolbar).
- **Menu vs toolbar wording:** Copy Diff as Patch (menu) vs Copy diff (toolbar).
- **Your public key, four verbs:** Export my public key, Share My Public Key,
  Send my key, Share my key….
- **Disk writes, two verbs:** Export Diff as HTML…, Export snippets, Save
  Snippet as File… (#108).
- **Destructive verbs used loosely:** Close, Discard, Delete, Remove, Clear.
- **Placeholders, five shapes:** Paste JSON…, Paste lines…, Paste or type the
  snippet…, Paste original text here… or drop a file.
- **Flat menus:** File has 16 items; four copies, four view toggles and three
  zoom steps sit loose; Terminal is a menu with one item.

The inventory (verbs leading a short label in `en.json`): Copy 29, Open 29,
Save 22, Add 18, Export 16, Paste 16, Delete 15, Close 13, Share 12, Import 12,
Remove 7, Reset 7, Restore 7, Clear 7, Send 2, Discard 2.

## Solution

**Rules** (written into `docs/standards.md` as a voice and naming guide):

| rule | detail |
|---|---|
| Casing | menu items Title Case; buttons, tooltips, placeholders, dialogs sentence case |
| Save | keep in the library |
| Export | write a file to disk |
| Share | hand something to another person (a diff, your public key) |
| Import / Add | Import from a file you pick; Add one item by hand |
| Delete / Remove / Close / Discard / Clear | destroy a saved item / take out of a list or field / end a tab or dialog / drop unsaved edits / empty an input or search |
| Placeholders | "Paste or type <thing>…", plus ", or drop a file" where a drop works |
| Ellipsis | only when more input follows (a dialog or picker) |
| Pairs | a menu item, its button and its shortcut hint use the same words |

**Menus** (approved menu map): File gains Import ▸ and Export ▸; Edit gains
Copy ▸; View gains Display ▸ and Zoom ▸; Security gains My Key ▸ and Trusted
Keys ▸; Tools groups by the Tools panel's five job groups; Terminal's one item
moves into Help. Every shortcut keeps working without opening a submenu.

**Guard** in `check:i18n`: menu keys (`menu.*`) must be Title Case; a short
list of retired synonyms (`Send my key`, `Paste Text Mode`, `Save … as File`)
fails the build if it comes back.

| option | why not |
|---|---|
| Sentence case everywhere | the user chose A on the canvas |
| Keep "Save as file" | Save now means the library only |
| Send / Export for the key | the user chose Share |
| Import for everything incoming | "Import tag" reads oddly; Add is the word for keys |
| Fewer destructive verbs | "Remove search" reads oddly |
| Short placeholders | drop the paste / drop hint new users rely on |

## Scope

**In:** every user-facing string in `src/shared/i18n/en.json` the rules touch;
both menus (native and in-app) and the command palette entries they feed; the
guide; the guard; `en-XA`; specs that find elements by name.

**Out:** other locales (none ship yet); help or README prose beyond the
renamed labels.

## Design

**Source of truth:** https://claude.ai/artifact/E174ittqxaradEYSE3Kx2m
**Approved design:** its "Approved design" page (2026-10-27): the complete menu
map and the naming-rules sticky, awaiting sign-off.

| artboard | shows |
|---|---|
| Approved: complete menu map | every menu with every submenu expanded; new or moved items tinted |
| (proposals) Today | the Edit menu beside the toolbar, live app |
| (proposals) A / B | the two casing options; A chosen |
| (proposals) Grouped File / Edit / View | the first grouping pass |

No colour or surface changes; the in-app menu bar already draws submenus
(Security ▸ Configuration), so nothing new is styled.

## Security rules touched

None: strings and menu structure only. The Report an Issue item keeps its
confirm-before-open path; Terminal's item still opens Settings ▸ Terminal.

## Test plan

- **unit, red first:** `menus.test` — the in-app tree matches the approved map
  (submenu titles and children); `commands.test` still resolves every action a
  menu names; `check-i18n` guard fixtures: a Title Case miss in `menu.*` and a
  retired synonym each fail.
- **e2e:** `openMenu(page, top, sub, leaf)` drives the new submenus (Edit ▸
  Copy ▸ Diff as Patch; File ▸ Export ▸ Snippet as File…); specs that find a
  renamed label or placeholder are updated in the same slice.
- **locale:** `e2e/locale.spec.mjs` with `en-XA` still finds no clipped
  control in the regrouped menus.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | no feature change |
| `docs/screenshots/*.png` | no | no captured frame shows a menu |
| `docs/standards.md` | yes | the voice and naming guide |
| `docs/features.md` | yes | renamed labels it quotes |
| `docs/roadmap.md` | no | not a roadmap item |

## Delivery

| # | slice | branch | base | PR | status |
|---|---|---|---|---|---|
| 1 | Menus regrouped and their labels (both menus, palette); Terminal into Help | `improvement/menu-groups` | `main` | | |
| 2 | Catalogue-wide renames, placeholders, the guide and the `check:i18n` guard | `improvement/label-vocabulary` | slice 1 | | |

## Implementation plan

- [ ] 1. Slice 1: red tests; native and in-app menus; palette; specs; check, e2e, validate; PR.
- [ ] 2. Slice 2: inventory diff; renames; placeholders; guide; guard (red first); specs; check, e2e, validate; PR.
- [ ] 3. Merge bottom-up as each is green.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-10-27 | Menus Title Case, the rest sentence case | the user's choice on the canvas (A) | sentence case everywhere |
| 2026-10-27 | Save = library, Export = disk | the user's choice | keeping "Save as file" |
| 2026-10-27 | Group menu items into submenus, as the approved map | the user asked, then approved the complete map | flat menus |
| 2026-10-27 | Share is the key verb | the user's choice | Send; Export |
| 2026-10-27 | Import = from a file, Add = one item | the user's choice | Import for everything |
| 2026-10-27 | The destructive-verb glossary | the user accepted it | fewer verbs |
| 2026-10-27 | "Paste or type <thing>…" placeholders | the user's choice | short noun placeholders |

## Validation

- [ ] `/validate`
- [ ] `npm run check`
- [ ] `make e2e`
- [ ] Docs-impact "yes" done
- [ ] token usage measured
