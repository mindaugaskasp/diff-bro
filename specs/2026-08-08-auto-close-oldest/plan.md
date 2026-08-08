# Make room for a new comparison automatically

|                                         |                            |
| --------------------------------------- | -------------------------- |
| **Status**                              | in-progress                |
| **Progress**                            | 0 / 6 steps                |
| **Branch**                              | `feat/sidebar-reorder` (shared) |
| **Started**                             | 2026-08-08                 |
| **Finished**                            | —                          |
| **Bugs found and fixed this iteration** | 0 / 0                      |
| **Token baseline**                      | 2026-08-08T15:06:11Z (shared branch) |
| **Claude tokens used**                  | —                          |

## Problem

The tab strip is capped — 16 tabs, or `MAX_LIVE_CHARS` between them, whichever
comes first (`utils/tabs.js:145`). Past that, `open()` refuses and shows
"…Close one first." (`tabsStore.js:175`). Every route into a comparison hits it:
the + button, a dropped file, a saved diff, `diffbro compare` from a terminal,
`git mergetool` walking a conflict list.

The refusal is correct — a comparison silently evicted is work silently lost —
but for a reader who treats tabs as a scroll-back rather than a workspace, it is
a stop sign in front of the thing they asked for, every time.

## Solution

An opt-in setting: **close the oldest comparison to make room**. Off by default,
because evicting someone's work without being asked is the worse failure.

When it is on and the strip is full, the oldest tab is closed and the new
comparison takes its place. If that tab holds **unsaved** work, the same
consequence the close guard already enforces applies — the reader is asked
first, and the open resumes only if they say yes.

| option                                        | why not                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Always evict, no setting                      | The current refusal exists because losing a comparison is worse than being told no. Changing that for everyone is not the ask.                             |
| Evict the least-recently-VIEWED tab           | Needs a per-tab `lastSeenAt` nothing keeps today, and "oldest" is what the reader can see: it is the leftmost row in the strip.                             |
| Raise the cap instead                         | `MAX_LIVE_CHARS` is a memory bound, not a tidiness one. Raising it trades a refusal for a swap-thrash.                                                     |
| Ask every time, with no setting               | A prompt on every open is the stop sign again, one click further along.                                                                                    |

## Scope

**In:**

- `autoCloseOldest` in `settingsStore`, default off, persisted.
- A checkbox in Settings, beside the other tab/limit behaviour.
- `tabsStore`: make room on a full strip when the setting is on.
- A confirmation when the tab being evicted holds unsaved work, and the open
  resuming after it.

**Out:**

- Changing the cap, or how it is computed.
- Evicting anything other than the oldest — no LRU, no scoring.
- Any change to the ordinary close guard (`requestClose`), which already asks.

## Design

`open()` stays synchronous for its callers. When the strip is full it asks
`_makeRoom()`, which answers one of three ways:

- **the setting is off** → today's notice, `open()` returns null. Unchanged.
- **the oldest tab is safe to close** → close it, return true, carry on.
- **the oldest tab is unsaved** → park the request in `pendingEvict` and return
  false. The dialog's confirm closes the tab and re-issues the same `open()`.

"Oldest" is `tabs[0]` — the leftmost in the strip, which is what the reader
sees. The ACTIVE tab is never the victim: evicting what someone is looking at to
make room for what they asked for is a swap, not room. With only one tab open
nothing is evicted either — a single tab over the character budget is a bound,
not a queue, and `close()`'s last-tab path would blank it rather than remove it.

### Theme verdict — all 14

No new ink. The dialog is `BaseDialog` with the existing `.btn-destructive` /
`.btn-ghost` pair, and the checkbox is the `.row` label the Settings panes
already use — both already measured by `check:themes` and the sweep. The only
copy is text on `--bg-raised`, which the depth table holds at 4.5 on all 14.

## Security rules touched

**None.** No IPC, no fs, no crypto, no dependency, no external link. The setting
is a boolean beside the others in the settings store; the eviction closes a tab
the same way the × does.

## Test plan

- **unit** — `tabsStore`: with the setting off a full strip still refuses; with
  it on the oldest SAVED tab is closed and the new one opens; the active tab is
  never the victim; a single tab is never evicted; an unsaved oldest parks the
  request instead of opening.
- **unit** — the resume path: confirming closes the tab and opens the parked
  comparison exactly once; cancelling opens nothing and leaves the tab.
- **unit** — `settingsStore`: the flag persists and defaults off.
- **e2e** — `e2e/tab-evict.spec.mjs`: with the setting on, opening past the cap
  keeps the count at the cap and drops the leftmost; an unsaved leftmost asks
  first, and "keep it open" leaves both the tab and the count alone.
- **red → green** — each watched failing first.

## Docs impact

| surface                  | needed? | what changes                                                              |
| ------------------------ | ------- | ----------------------------------------------------------------------------- |
| `README.md`              | **yes** | the Keep row describes tab behaviour; the opt-in belongs beside it.       |
| `docs/screenshots/*.png` | no      | a settings checkbox in a pane the screenshots do not show.                |
| `docs/roadmap.md`        | no      | no track covers tab lifecycle.                                            |
| `docs/*.md`              | no      | no IPC, no crypto, no new term.                                           |

## Implementation plan

- [ ] 1. **Failing tests first** — `tabsStore` eviction + resume, `settingsStore` flag.
- [ ] 2. **`settingsStore`**: `autoCloseOldest`, default off, persisted.
- [ ] 3. **`tabsStore`**: `_makeRoom`, `pendingEvict`, `confirmEvict`, `cancelEvict`.
- [ ] 4. **`TabEvictDialog.vue`** + its catalogue keys, wired in `AppDialogs`.
- [ ] 5. **Settings checkbox** + catalogue key.
- [ ] 6. **Close**: README, prettier, `npm run check`, host e2e, `/validate`.

## Decisions

| date       | decision                                                              | why                                                                                                                                                     | rejected                          |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2026-08-08 | Off by default                                                        | The refusal exists because a silently evicted comparison is lost work. Opting in is the reader saying they treat tabs as scroll-back                    | on by default                     |
| 2026-08-08 | The ACTIVE tab is never evicted                                       | Closing what someone is looking at to open what they asked for is a swap, not room                                                                      | strict leftmost, always           |
| 2026-08-08 | A single open tab is never evicted                                    | `close()`'s last-tab path blanks rather than removes, and one oversized tab is a memory bound, not a queue                                              | evicting it and starting fresh    |
| 2026-08-08 | The parked request resumes through `open()` rather than a second path | One code path decides what opening means. A resume that rebuilt the tab itself would drift from it the first time `open()` changed                      | building the tab in `confirmEvict` |
| 2026-08-08 | Shares the `feat/sidebar-reorder` branch                              | The user asked for both remaining changes together, and both touch the sidebar/tab surface. The PR body says it carries two features                    | its own branch stacked on top     |

## Validation

- [ ] `/validate` — everything found is fixed in this change
- [ ] `npm run check`
- [ ] UI seen running — host e2e
- [ ] Docs-impact "yes" done
- [ ] token usage measured

**Outcome:**
