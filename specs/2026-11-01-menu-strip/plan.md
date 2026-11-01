# A menu strip on Windows and Linux, a gear on macOS

|                                         |                          |
| --------------------------------------- | ------------------------ |
| **Status**                              | in-progress              |
| **Progress**                            | 5 / 5 steps              |
| **Branch**                              | `improvement/menu-strip` |
| **Started**                             | 2026-11-01               |
| **Finished**                            |                          |
| **Bugs found and fixed this iteration** | 0 / 0                    |
| **Token baseline**                      | not measured             |
| **Claude tokens used**                  | not measured             |

## Problem

The redesign (#144) put every Windows and Linux menu behind one ≡ button beside the tabs. On Windows the maintainer read that as no menu bar and no Settings: the button works, but nothing says what it holds. macOS has its native bar, yet nothing in the window leads to Settings either.

## Solution

Windows and Linux get the menu names in a strip across the whole window, and ≡ goes. macOS keeps its native bar and gains a gear at the far right of the toolbar.

| option                        | why not                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Menu names in the one top row | takes the tabs' room                                                                   |
| ≡ labelled Menu, plus a gear  | the menus stay one click further away                                                  |
| A gear and no strip on Linux  | the menus would be reachable only by Alt, which depends on the desktop, or the palette |
| Showing the native bar        | unthemed: it ignores all 20 themes                                                     |

## Scope

**In:** `MenuBar.vue` as a strip, mounted in `App.vue`; the macOS gear; the test helpers that drove ≡.

**Out:** arrow-key navigation between menus, which ≡ never had. Alt still reveals the hidden native bar on Windows and Linux, as it did with ≡.

## Design

Canvas: <https://claude.ai/artifact/SV3Ejio3E5f1cjxGiPrsb1>, launch page **Approved design**, signed off by the maintainer on 2026-11-01.

| artboard                      | shows                                                   |
| ----------------------------- | ------------------------------------------------------- |
| Windows and Linux: menu strip | the strip above sidebar and tabs, Light and Dark        |
| macOS: gear                   | no strip, a gear at the toolbar's right, Light and Dark |

Layout rules: `.menubar` is a `.band` with a bottom `--border`, on `--bg-panel`. Each name is a plain `.btn .btn-sm`; the open one is `.active`. A presentation hides the strip with the top row. The gear is `.btn .btn-sm .btn-square`.

The menu order stays the native menu's (`tests/menuMap.fixture.js`): File, Edit, View, Security, Tools, Help. The renders have Tools before Security; the map wins, so the two menus cannot drift.

### Theme verdict — all 20

Every colour is an existing token on an existing control, and `make theme-sweep` holds the new `menu-strip` surface on all 20: the names and the open name to the reading floor. The keyline is `--border`, which `check:themes` holds.

## Security rules touched

None: no IPC, no fs, no crypto, no new dependency. The strip runs the same `buildMenus` rows as ≡, and DevTools stays hidden in packaged builds.

## Test plan

- **e2e:** `e2e/menu-strip.spec.mjs`: full width at the top; no Menu button; a menu opens under its name; hovering moves between open menus; three levels deep; Escape and a click elsewhere close it; a presentation hides it; no gear off macOS; on macOS (`navigator.platform` emulated over CDP) no strip, and the gear opens Settings.
- **sweep:** the `menu-strip` surface.

## Docs impact

| doc                 | changes | what                      |
| ------------------- | ------- | ------------------------- |
| `docs/features.md`  | yes     | where the menus are       |
| `docs/roadmap.md`   | yes     | the shipped list named ≡  |
| `README.md`         | no      |                           |
| `docs/standards.md` | no      | still names `MenuBar.vue` |

## Delivery

One PR: the strip and the gear replace one control, and neither stands alone.

## Implementation plan

- [x] 1. Failing spec: 5 of 7 red on the old code; the other 2 guard what must not change.
- [x] 2. `MenuBar.vue` as a strip, mounted in `App.vue`, out of `TopBar.vue`.
- [x] 3. The macOS gear and its icon.
- [x] 4. Test helpers, the sweep surface, docs.
- [x] 5. Gates, PR.

## Decisions

| date       | decision                                       | why                                                                  | rejected                                   |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| 2026-11-01 | Strip on Windows, gear on macOS, ≡ removed     | the maintainer chose it on the canvas                                | Menu names in the top row; ≡ labelled Menu |
| 2026-11-01 | Linux gets the strip, not the gear             | the maintainer: without it Linux's menus are only Alt or the palette | gear on Linux                              |
| 2026-11-01 | Keep the native menu's order, not the render's | `menuMap.fixture` holds the two menus to one map                     | Tools before Security                      |

## Validation

- `npm run check` 0 (4026 passed, 2 skipped).
- E2E, whole suite in Docker: 697 passed, 4 skipped, and the one failure was this spec's own macOS test, whose override never applied. After moving it to CDP emulation, `e2e/menu-strip.spec.mjs` passes 7 of 7.
- `✓ theme sweep ok — 3760 measurements across 20 themes`.
- Seen running: the strip, an open menu and the emulated macOS gear, against the Approved design.
- **Not seen:** real Windows, or a real macOS window. E2E runs on Linux, and the gear was checked with `navigator.platform` emulated.

### Token usage

Not measured: no baseline was recorded when the build started.
