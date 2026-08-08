# Write a snippet from the terminal

|                                         |                                        |
| --------------------------------------- | -------------------------------------- |
| **Status**                              | shipped                                |
| **Progress**                            | 5 / 5 steps                            |
| **Branch**                              | `improvement/appearance-pane` (shared) |
| **Started**                             | 2026-08-08                             |
| **Finished**                            | 2026-08-09                             |
| **Bugs found and fixed this iteration** | 9 / 9                                  |
| **Token baseline**                      | 2026-08-08T17:02:53Z (shared)          |
| **Claude tokens used**                  | not measured                           |

Written after the fact, because the work arrived as a series of direct requests
rather than through `/implement`. It records the decisions, which is the part
worth keeping.

## Problem

`diffbro create snippet` opened the empty editor. There was no way to capture
something you already had in the terminal without leaving it, and the CLI's own
subcommands were documented only by `diffbro help` — invisible to anyone who
had not installed the shim yet.

## Solution

`diffbro create snippet --interactive` asks for a name, a syntax and a body,
then hands the snippet to the app tagged `cli`. Flags answer any question up
front; piped input skips the questions entirely. A Terminal menu opens the
Settings pane that lists every subcommand.

## Decisions

| date       | decision                                                                | why                                                                                                                                                                                         | rejected                       |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 2026-08-08 | The draft crosses to a running app in a FILE, not the lock's payload    | Chromium's POSIX singleton mis-sizes `additionalData`: whitespace plus any character above U+00FF (an em dash) killed the running app and lost the command. Only a short ASCII path travels | `additionalData`; a socket     |
| 2026-08-08 | Only `new snippet` is carried; every other verb is re-parsed on arrival | `routeCliArgv` is the only place that resolves a path against the SHELL's cwd. Carrying them skipped it, so `cd ~/work && diffbro compare a.json` read the wrong file                       | carrying every command         |
| 2026-08-08 | `readline`, not a synchronous read of fd 0                              | A terminal leaves fd 0 non-blocking, so `readSync` throws EAGAIN and the first version read that as end-of-input. readline also brings line editing and a working Ctrl+C                    | raw mode; an EAGAIN retry loop |
| 2026-08-09 | `:wq`/`:x` write, `:q`/`:a` discard                                     | The notation borrows vim's muscle memory, so it takes vim's meanings. Reading `:q` as save was backwards for exactly the readers the spelling was chosen for                                | `:q` saves; a `.` terminator   |
| 2026-08-09 | One verb, `create snippet --interactive`                                | Two verbs with near-identical names doing different things read as a mistake in `--help`                                                                                                    | keeping `new snippet`          |
| 2026-08-08 | Prompts on stderr, the confirmation on stdout                           | stdout is for output; a redirect must capture the answer, not the questions                                                                                                                 | everything on stdout           |
| 2026-08-08 | It says "Handed to Diff Bro", never "Saved"                             | The lock is one-way by design, so the process that asks the questions never learns whether the one that saves succeeded. Claiming otherwise would be a guess                                | "Saved."                       |
| 2026-08-08 | Piped stdin is the BODY, and nothing is asked                           | Input nobody saw a prompt for is not an answer — reading it as one made `cat f.sql \| diffbro …` save the wrong thing under the wrong name                                                  | prompting anyway               |
| 2026-08-09 | An unnamed snippet is `<timestamp> - cli snippet`                       | The store's own `Untitled <date>` loses where it came from                                                                                                                                  | the store's fallback           |

## Security rules touched

The draft file is the only new surface: snippet plaintext, `0o600`, in a
`mkdtemp` directory, unlinked as it is read, and swept on launch if older than
ten minutes — the same discipline the clipboard staging uses. Its path arrives
from another process, so it is untrusted: only our own staging shape is opened,
size-capped before reading, and nothing else is ever deleted.

No IPC added, no network, no new dependency.

## Test plan

- **unit** — `cliPrompt` (the conversation, driven with its IO handed in),
  `cliTerm` (colour, the folded list, the confirmation), `cliDraft` (the file
  round trip, its refusals, the sweep), `cli` (flags and their errors).
- **e2e** — the piped path end to end, and a relative-path `compare`.
- **pty** — the interactive conversation and Ctrl+C cannot be reached by a pipe
  and are driven through a real pty by hand.

## Validation

- [x] `npm run check`
- [x] e2e green
- [x] theme sweep green
