# `diffbro open` and `diffbro backup`

|                                         |                                |
| --------------------------------------- | ------------------------------ |
| **Status**                              | shipped                        |
| **Progress**                            | 12 / 12 steps                  |
| **Branch**                              | `feat/cli-open-and-backup`     |
| **Started**                             | 2026-08-02                     |
| **Finished**                            | 2026-08-03                     |
| **Bugs found and fixed this iteration** | 0 / 0                          |
| **Token baseline**                      | 2026-08-02T20:11:28Z           |
| **Claude tokens used**                  | 77,035,828 (mostly cache read) |

## Problem

Two gaps in the terminal surface (`src/main/cli.js`).

**1 · No way to just open the app.** `COMMANDS` offers `compare`, `difftool`,
`create`, `cb`, `help`. A bare `diffbro` does raise the app — `parseCli` returns
`{command: null, error: null}` (cli.js:143) and the launch falls through to
`ensureMainWindow()` — but that behaviour is undocumented, absent from
`CLI_USAGE`, and indistinguishable from a typo that silently did nothing. There
is no spelling of "open this file and wait for the other one" that reads as
opening rather than comparing.

**2 · A backup cannot be taken from the terminal, or put anywhere.**
`config:backup` (share.js:466-480) already seals `{identity, trusted, snippets,
settings}` under a scrypt passphrase and writes `.diffbroconf` — but only
through `dialog.showSaveDialog`, so the destination is always hand-picked and
the whole thing is unreachable from a script. It also excludes saved diffs by
deliberate choice (configBackup.js:3, "Diffs excluded (ephemeral)"), so it is a
config backup, not a state backup. Nothing produces a compressed archive.

## Solution

**`open`** is a thin verb over the path the app already has. `open` with no
argument delivers a `raise` command; `open <path>` reuses the existing `compare`
command with a single file, which already means "fill the left slot and wait".
No new renderer handling for the file case.

**`backup <path>`** routes to the running app and reuses the sealed-bundle
pipeline end to end: the renderer builds the bundle, main seals it with
`sealConfig` and writes it, and `config:restore` reads it back. Three
extensions: the bundle gains `vault` / `theme` / `session`; the destination
comes from the CLI instead of a save dialog; the sealed envelope is written
inside a zip container via `fflate` (already a production dependency).

| option                                                                         | why not                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Headless `backup`: prompt for the passphrase on the TTY, seal entirely in main | Scriptable, and the tempting answer. But the bundle is built in the **renderer** (`snippetStore._bundle` decrypts through `vault:decrypt`), so main would need a second copy of that logic; it needs raw-mode stdin; and it would run outside the single-instance lock, reading store files while the running app writes them. Three new risks to avoid one dialog. Revisit as a follow-up if cron support is actually wanted. |
| A new backup format instead of `sealConfig`                                    | A second bespoke copy of the crypto is this repo's recurring failure. `config:restore` already exists and would not read it.                                                                                                                                                                                                                                                                                                   |
| `open <path>` gets its own command name                                        | `compare` with one file is already exactly this behaviour. A second name for it means two renderer paths that must not drift.                                                                                                                                                                                                                                                                                                  |
| Zip the plaintext bundle, then seal the zip bytes                              | Compresses far better (JSON deflates ~80%; base64 ciphertext ~25%), but the output stops being a readable zip and `sealConfig` would need a bytes-in variant plus a `diffbro-config/2` bump, breaking restore of existing files. Recorded as a possible follow-up.                                                                                                                                                             |
| `open` accepting two paths                                                     | That is `compare`. Keeping `open` to at most one path keeps the two verbs from becoming synonyms.                                                                                                                                                                                                                                                                                                                              |

## Scope

**In:** `open` and `backup` verbs in `cli.js` (parse + help); `raise` command
routing; `backup` routing to a prefilled `ConfigBackupDialog`; bundle extended
with `vault`/`theme`/`session` on both the seal and restore side; zip container;
unit + e2e tests; README, `docs/security.md`, `docs/ipc-security.md`.

**Out:** headless/TTY passphrase entry (rejected above — follow-up if cron is
wanted); a scheduled/automatic export to an external path (`autoBackup.js`
already owns scheduling, in-data-dir); restoring a zip from the CLI (`backup`
writes; `config:restore` in Settings reads); compressing the plaintext before
sealing (needs a format bump).

## Design

No new surface of its own. `backup` reuses `ConfigBackupDialog.vue` and adds one
`.dialog-note` line naming the destination path — an existing shared class from
`ui.css`, `--text-dim` on the dialog's own ground, no new token and no new
control. The dialog's panel, buttons and spacing are unchanged, so the control
heights (`--control-h`) and `.band` rules are inherited rather than restated.

### Theme verdict — all 14

Grounds parsed from `src/renderer/src/styles/themes.css` (`--bg`, relative
luminance ≥ 0.5 = light) — 7 light, 7 dark, matching the standards' count.

| theme    | ground | `--bg`    | verdict | note                                                                  |
| -------- | ------ | --------- | ------- | --------------------------------------------------------------------- |
| light    | light  | `#ffffff` | passes  | floating-canvas inversion; note sits on `--bg-raised`, not the canvas |
| dark     | dark   | `#0d1117` | passes  |                                                                       |
| solar    | light  | `#fffdf6` | passes  |                                                                       |
| neon     | dark   | `#090d18` | passes  | accent `#22d3ee` unused by the note — no accent-tinted text           |
| nord     | dark   | `#2e3440` | passes  |                                                                       |
| sepia    | light  | `#e9dcbe` | passes  | lowest-contrast light ground; `--text-dim` is already toned for it    |
| dim      | dark   | `#1b1917` | passes  |                                                                       |
| beacon   | dark   | `#000000` | passes  | hard keyline contract untouched — no border added or softened         |
| meridian | light  | `#f5f7f4` | passes  |                                                                       |
| linen    | light  | `#faf7f0` | passes  |                                                                       |
| bloom    | light  | `#f9f4f5` | passes  |                                                                       |
| nyan     | dark   | `#160a20` | passes  | accent `#ff2ecb` unused — nothing glows                               |
| matrix   | dark   | `#020a04` | passes  | accent `#00ff41` unused                                               |
| contrast | light  | `#ffffff` | passes  | hard keyline `#111111` contract untouched                             |

A long path would overflow the dialog, so the note wraps rather than
`text-overflow: ellipsis` — the tail of a path is the part that identifies it.

## Security rules touched

- **Rule 3 (renderer never touches Node/Electron).** Preserved by construction:
  the renderer builds the bundle and passes it over IPC; all fs work (zip, write)
  stays in main.
- **Rule 4 (keys never cross the IPC boundary).** The critical one.
  `config:backup` fetches `identity` via `getIdentity()` **inside main**
  (share.js:475) and never returns it to the renderer — the new fields must not
  change that. The **vault key is never in the bundle**: `vault.key`
  (vault.js:44) is excluded, which is what makes the archive portable —
  contents are decrypted and re-sealed under the passphrase, not shipped as
  key-plus-ciphertext.
- **Rule 5 (crypto invariants).** `sealConfig` is passphrase AES-256-GCM with no
  TTL and no signing, by design (configBackup.js:1-3). Adding fields to the
  sealed bundle changes what is inside the envelope, not the envelope, so
  `SCRYPT_PARAMS` (N=2^17) and the GCM tag are untouched. `openConfig` stays
  compatible with existing `.diffbroconf` files. Negative tests required: wrong
  passphrase, tampered ciphertext, tampered tag.
- **Rule 6 (untrusted input is hostile).** `backup <path>` is a
  user-supplied write target. It must be resolved against the shell cwd, refused
  when it is a directory, refused when the parent does not exist, and refused
  when it resolves inside the data dir (`getDataDir()`) — which would fold the
  backup into the thing being backed up. An existing file is refused rather than
  silently overwritten.
- **Rule 1 (offline), 2 (no new dependency), 7 (openExternal), 8 (injection).**
  Untouched — `fflate` is already a production dependency (`package.json:34`,
  used by `src/main/xlsx/unzip.js`), so no new network audit is due.

## Test plan

Written before the code; each bug's test watched failing first.

- **unit** — `tests/main/cli.test.js`: `open` with no path → `raise`; `open
<path>` → a `compare` command with one resolved file; `open a b` → an error,
  not a silent second file; `backup <path>` → a `backup` command with the
  resolved path; `backup` with no path → an error naming the missing path;
  empty-string and whitespace paths rejected (the existing `parseCompare` guard);
  `help open` / `help backup` return their entries, and `CLI_USAGE` lists both.
- **unit** — `tests/main/configBackup.test.js`: seal → open round-trip carrying
  the new `vault` / `theme` / `session` fields; a v1 envelope written before this
  change still opens (compatibility); wrong passphrase → `wrong-passphrase`;
  flipped ciphertext byte and flipped tag byte both fail closed.
- **unit** — `tests/main/backupZip.test.js`: the written container is a real zip
  (`unzipSync` round-trip), holds exactly the sealed entry, and refuses a
  directory / a missing parent / a path inside the data dir / an existing file.
- **e2e** — `e2e/cli.spec.mjs` (extended, real second process — the only thing
  that proves the single-instance argv round-trip): `diffbro open` with the app
  running raises it and opens no comparison; `diffbro open <file>` fills the left
  slot and leaves the right waiting; `diffbro backup <path>` raises the
  passphrase dialog showing that path, and completing it writes a file that
  `unzipSync` reads.
- **red → green** — record each failure before the fix.
- **seed fixtures** — no change. No new file format is introduced; `open` takes
  the formats `compare` already accepts, and `backup` writes rather than reads.

## Docs impact

| surface                  | needed? | what changes                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`              | **yes** | The Terminal feature row and the "More terminal commands" bullet (README.md:59, :73) enumerate the commands; two more join them.                                                                                                                                                                   |
| `docs/screenshots/*.png` | no      | The five captured states are `empty-state`, `diff-dark`, `diff-light`, `save-encrypted`, `spreadsheet-diff`. None contains `ConfigBackupDialog`, and no captured state changes.                                                                                                                    |
| `docs/roadmap.md`        | no      | The three live tracks are Spreadsheet, Onboarding, Signing. The CLI is not a tracked item, so nothing moves open → done.                                                                                                                                                                           |
| `docs/brand/roadmap.svg` | no      | Same reason — no track changes, so the hand-authored board is untouched.                                                                                                                                                                                                                           |
| `docs/*.md`              | **yes** | `security.md`: what a backup now contains (saved diffs and the identity key, sealed) and that it is portable but only as strong as the passphrase. `ipc-security.md`: the changed `config:backup` payload and the new CLI-supplied path, with its validation. `glossary`/`standards.md` unchanged. |

## Implementation plan

- [x] 1. Failing unit tests in `tests/main/cli.test.js` for `open` and `backup`
      parsing, including the rejection cases. Watch them fail.
- [x] 2. Add `open` to `COMMANDS` and `VERBS` in `src/main/cli.js`; a bare `open`
      yields `{name: 'raise'}`, `open <path>` yields the existing `compare`
      shape with one file, two paths error.
- [x] 3. Route `raise` in `src/main/cliRoute.js` — `ensureMainWindow()` +
      `focus()` with no renderer message; confirm `deliver(null)` is not the
      accidental path.
- [x] 4. Add `backup` to `COMMANDS`/`VERBS` with the path resolved through the
      same cwd resolver `compare` uses.
- [x] 5. Failing unit tests for the zip writer (10) and the vault bundle (7).
- [x] 6. Extend the sealed bundle with `vault` / `theme` / `session` on the seal
      side (`share.js` `config:backup`) and the restore side
      (`applyRestoredConfig`), keeping `identity` main-side only and existing
      `.diffbroconf` files readable.
- [x] 7. `src/main/backupZip.js` — pure, testable: validate the destination
      (rule 6 list above), `zipSync` the sealed envelope, write atomically.
- [x] 8. Route `backup <path>` in `cliRoute.js`: vouch for the path, raise the
      window, deliver a command the renderer turns into `ConfigBackupDialog`
      prefilled with the destination.
- [x] 9. `ConfigBackupDialog.vue` — the destination `.dialog-note` line, and the
      CLI-supplied path replacing the save dialog when one is present.
- [x] 10. Extend `e2e/cli.spec.mjs` with the three flows; run in the container.
- [x] 11. Docs: README terminal row + bullet, `docs/security.md`,
      `docs/ipc-security.md`.
- [x] 12. `npx prettier --write` on touched files, `npm run check`, `/validate`.

## Decisions

| date       | decision                                                                        | why                                                                                                                                                                                                                          | rejected                                                 |
| ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2026-08-02 | Backup is portable and passphrase-sealed                                        | User's call when asked; makes the archive restorable on another machine, which a key-excluded snapshot is not                                                                                                                | Same-machine snapshot; both-with-a-flag                  |
| 2026-08-02 | Contents: all stores except `vault.key` and `backups/`                          | User's call when asked — a true state snapshot rather than just the encrypted library                                                                                                                                        | Encrypted library only; a literal mirror of the data dir |
| 2026-08-02 | The bundle also carries `identity` + `trusted`, as `config:backup` already does | Without the sharing identity a restore silently loses the ability to open diffs sent to you. It is sealed under the passphrase and never leaves main. **Worth confirming — it goes slightly beyond the stores named above.** | Stores only, dropping identity                           |
| 2026-08-02 | Passphrase is collected in the app, not the terminal                            | The bundle is built in the renderer; a TTY route needs a second copy of that logic, raw-mode stdin, and reads files the running app is writing                                                                               | Headless TTY prompt (see Solution table)                 |
| 2026-08-02 | `open <path>` delegates to the existing `compare` command                       | One renderer path, no drift; `compare` with one file already means "left slot, waiting"                                                                                                                                      | A distinct `open` command name                           |
| 2026-08-02 | Bare `diffbro` keeps raising the app; `open` is the documented spelling         | Removing the fallback would break anyone relying on it; documenting it as `open` makes it discoverable in `CLI_USAGE`                                                                                                        | Making a bare `diffbro` print usage instead              |

## Validation

- [x] `/validate` — ran; full report in `quality-audit.md`. Found `session` sealed
      but never restored (fixed here, test first). The PR review then found the
      bigger one: the restored `vault` bundle reached the renderer with no
      main-side caps, unlike `snippets` beside it. Both fixed.
- [x] `npm run check` — exit 0, **1901 passed**, 2 skipped, coverage floors unchanged
- [x] flows seen running in the Docker env — `e2e/cli.spec.mjs` +
      `e2e/config-backup.spec.mjs`, **10 passed** (the config-backup three matter
      because this changed the `config:backup` IPC signature)
- [x] every Docs-impact "yes" done — README, `docs/security.md`,
      `docs/ipc-security.md` (two guard rows)
- [x] seed fixtures: n/a — no new format
- [x] token usage measured, header row filled

### Token usage

```sh
node .claude/skills/implement/token-usage.mjs --since <token baseline>
```

| category    |     tokens |
| ----------- | ---------: |
| input       |        350 |
| output      |    126,459 |
| cache write |    226,771 |
| cache read  | 76,682,248 |
| **total**   | 77,035,828 |

**Outcome:** shipped to PR #18 — reviewed by `diff-bro-reviewer[bot]`, both
blocking findings fixed, `reviewDecision: APPROVED`. Status stays `in-progress`
until it merges: under the new _Landing it_ convention, landing on `main` is what
finishes a spec.

Four follow-ups deliberately not taken here, all recorded on the PR: the
synchronous `zipSync`/`writeFileSync` (a large vault blocks the main process), a
bad CLI path reported only in the GUI, the dialog closing on a failed write, and
a loose e2e button selector.
