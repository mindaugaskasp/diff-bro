# What the app is using, and a way to get it back

| | |
|---|---|
| **Status** | shipped |
| **Progress** | 7 / 7 steps |
| **Branch** | `feat/diagrams-snippets-rail` (continues the batch) |
| **Started** | 2026-08-02 |
| **Finished** | 2026-08-02 |
| **Bugs found and fixed this iteration** | 0 / 0 |
| **Token baseline** | 2026-08-02T15:20:00Z |
| **Claude tokens used** | not measured |

## Problem

Settings → Storage names the data folder and nothing about its size. Backups
accumulate on their own schedule — every 6 hours by default, each one a full
copy of the vault and the snippet library — and `rotate()` only trims to a
generation count (`autoBackup.js:113`), which says nothing about age or bytes.
So the one question a reader has ("how much is this costing me, and can I get
some back?") has no answer in the app, and the only lever is deleting files by
hand in a folder holding their keys.

`listBackups` already returns `bytes` per file. Nothing displays it.

## Solution

In the Storage pane: **what is on disk**, broken into the parts that grow, and a
button that deletes backups past an age the reader picks.

```
Storage
  Saved diffs & snippets   1.4 MB
  Backups (12)             8.9 MB
  ─────────────────────────────────
  Total                   10.3 MB

  Older than [ 1 week │ 2 weeks ] →  [ Delete 7 backups (5.1 MB) ]
```

The button names what it will do before it does it — a count and the bytes it
frees — because a delete that reads "Clear old backups" makes the reader guess.

| option | why not |
|---|---|
| A total with no breakdown | "10 MB" does not tell you what to do about it; the breakdown points at backups, which is the part that grows on its own |
| Delete straight to a fixed age | different people keep different amounts of history; the two ages are the ones worth offering, and the count makes the consequence visible |
| A confirmation dialog | the button already states the count and size, and backups are redundant copies by definition — the vault itself is untouched |

## Scope

**In:** the usage figures, the age picker, the prune action, and a main-process
handler that deletes only backup files, only in the backup folder, only past
the age it is given.

**Out:**

- **Deleting anything but backups.** Saved diffs and snippets go through their
  own delete paths, with their own confirmations.
- A size cap or automatic pruning by bytes. `rotate()`'s generation count stays
  the automatic policy; this is the manual lever.
- Per-file selection. The list already offers restore per file; this is the bulk
  answer to "these are old".

## Design

- Lives in `BackupSettings.vue` (it already lists backups and knows their
  sizes) with the totals in `StorageSettings.vue` above it, since the figures
  cover the whole folder.
- The age is a `SegmentedControl` — two options, the repo's one-of-N primitive.
- Sizes format through one shared helper, so "8.9 MB" reads the same everywhere.
- Nothing new visually: existing `.btn`, `.seg`, `.dialog-note`.

### Theme verdict — all 14

No new surface or token — a segmented control and a button in a pane that
already has both. Table omitted for that reason.

## Security rules touched

**Rule 6 (untrusted input) is the one this lives on.** A renderer asking main to
delete files is exactly the surface that needs fencing, so the handler:

- takes an AGE IN DAYS, never a path or a filename — the renderer cannot name a
  file to delete;
- validates it as a finite number within a fixed allow-list of ages;
- deletes only inside `backupDir()`, and only names that parse as a backup
  (`backupTime(name) !== null`), which is the same gate `listBackups` uses;
- never follows anything outside that directory: names come from `readdirSync`
  of that directory, not from the caller.

Rule 4 is untouched (no key material moves). The vault and snippet stores are
not read, written or deleted by this path.

## Test plan

- **unit — `tests/main/autoBackup.test.js`**: `pruneOlderThan(dir, days)` removes
  only files older than the cutoff, leaves newer ones, ignores files that are not
  backups (a stray `notes.txt` in the folder survives), reports the count and
  bytes freed, and returns zero on a missing directory.
- **unit**: the size formatter — bytes, KB, MB boundaries, and zero.
- **e2e — `e2e/auto-backup.spec.mjs`**: the pane shows a non-zero total; with a
  backup present, the button names a count; pressing it removes what it named.
- **red → green** — each watched failing first.

## Docs impact

| surface | needed? | what changes |
|---|---|---|
| `README.md` | no | Storage is not in the feature table; this is a pane detail |
| `docs/ipc-security.md` | **yes** | a new handler that DELETES files belongs in the IPC table with its validation |
| `docs/screenshots/*.png` | no | no captured frame shows Settings |
| `docs/roadmap.md` | no | opens no track |

## Implementation plan

- [x] 1. Token baseline.
- [x] 2. `pruneOlderThan` + size formatter tests — red.
- [x] 3. Implement both; green.
- [x] 4. The IPC handler, age allow-list, preload entry.
- [x] 5. The pane: totals, age picker, the button that names its consequence.
- [x] 6. e2e.
- [x] 7. `docs/ipc-security.md`, `npm run check`, audit.

## Decisions

| date | decision | why | rejected |
|---|---|---|---|
| 2026-08-02 | The handler takes an AGE, never a filename | a renderer that can name a file to delete is a renderer that can delete the wrong one | passing the list of names to remove |
| 2026-08-02 | The button states the count and the bytes | a delete button that does not say what it deletes makes the reader guess | a generic "Clear old backups" |
| 2026-08-02 | No confirmation dialog | the button is already specific, and a backup is a redundant copy — the vault is untouched | an armed two-click delete |

## Validation

- [x] `npm run check` — `style tokens ok (91 stylesheets)`,
      `✓ theme depth ok (14 themes)`, `127 passed | 1 skipped` files,
      `1865 passed | 2 skipped` tests
- [x] e2e — `e2e/auto-backup.spec.mjs` 4 passed, including the handler refusing
      an age it does not offer (`9999`, the string `'7'`, `-1`) while leaving
      every backup in place. Full suite `291 passed, 2 skipped`
- [x] `docs/ipc-security.md` — the delete surface is in the guard table
- [x] `make local-seed` — n/a

**Red → green recorded:** `autoBackup.test.js` 4 failures (`pruneOlderThan is
not a function`) → 22 passed; `byteSize.test.js` failed to resolve its import →
2 passed.

**Outcome:** shipped as planned. The riskiest part is the only new thing in
main — a handler that deletes — so it takes an age from a fixed allow-list
rather than a filename, and the e2e drives the refusal rather than trusting the
code to hold.
