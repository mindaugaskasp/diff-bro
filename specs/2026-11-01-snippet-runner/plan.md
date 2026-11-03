# Run a snippet with a local PHP or Python

|                    |                                        |
| ------------------ | -------------------------------------- |
| **Status**         | approved                               |
| **Progress**       | 6 / 6 slices                           |
| **Branch**         | `feat/snippet-runner-*`, one per slice |
| **Started**        | 2026-11-01                             |
| **Token baseline** | not measured                           |

## Goal

Run a snippet with your own PHP or Python, and read its output in a pane below it. Off until you turn it on and pick the program.

## Decisions so far

| decision                                                                                                                                                       | why                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Output in a docked console under the editor, not a floating card                                                                                               | the maintainer picked A. It never covers code                                                                     |
| Any snippet of an enabled language can run, wherever it came from                                                                                              | the maintainer, replacing "hand-made only". No origin mark is needed                                              |
| Except secret snippets: Run is off, and main refuses them                                                                                                      | the maintainer. A script could print or write what they hold, which breaks their promise                          |
| The first run ever shows a confirmation that Diff Bro takes no responsibility for code run from a snippet window. It never shows again, so it has no checkbox  | the maintainer                                                                                                    |
| The confirmation is a native dialog from main                                                                                                                  | code in the window can't skip it                                                                                  |
| Run uses the text on screen, so an unsaved draft or unsaved edits can run                                                                                      | the maintainer. Quick testing is the point; reading the saved text would add a step to every try                  |
| Off by default. Settings ▸ Integrations ▸ Languages ▸ PHP / Python                                                                                             | the maintainer                                                                                                    |
| Settings' Claude tab moves into Integrations, beside Languages. A Claude heading over its controls, without the "Claude connection" subheading and description | the maintainer, in a note on the canvas                                                                           |
| You pick the executable; the app never searches for one                                                                                                        | the maintainer. Also removes PATH and Windows Store stub problems                                                 |
| Output can be saved as its own snippet, plain text                                                                                                             | the maintainer                                                                                                    |
| The offline promise stands: the app forces nothing online, and a script is the user's own act                                                                  | the maintainer. Rule 1, `docs/security.md` and the README say so explicitly, as they do for the Claude connection |
| Run one line from the gutter: hovering a line swaps its number for a play button that runs that line. Toolbar Run still runs the whole snippet | the maintainer picked option B on 2026-11-03 (#195); the split Run button (A) was dropped |
| The gutter play on line N runs lines 1 to N, labelled "Up to line N" in the pane | the maintainer, 2026-11-03 (#195). A line alone fails on anything set above it; a live session is a separate feature |
| A line that opens or sits inside a block runs through the end of that block: Python while lines are indented deeper, PHP until braces balance. The pane names the real last line | the maintainer, 2026-11-03 (#195). Cutting a block mid-way is a syntax error |
| The play button shows on lines with code only: not on blank lines, comment-only lines, or the shebang / `<?php` line | the maintainer, 2026-11-03 (#195) |
| No shortcut for running a line, for now: mouse-only from the gutter | the maintainer, 2026-11-03 (#195). A shortcut needs a menu item, which this version keeps out |
| A plain output pane, not a real terminal: no `input()`, no curses                                                                                              | `node-pty` is a native dependency with an install script (rule 2). Recommended; revisit if input is needed        |

## Design

Canvas: <https://claude.ai/artifact/Uu1MY1TCdRuzaKNUJ29B75>, launch page **Approved design**, signed off by the maintainer on 2026-11-01. Rendered on the real app with macOS emulated. The output text is a mock, and Linux fonts stand in for SF. The confirmation is drawn as a macOS alert; the real one is the OS's own, so it looks native on each platform.

**Docked console:** a pane under the editor, as in Xcode. It never covers code and suits "the document ends flush with the window". Rejected: a floating card, which hides the last lines of code.

Run sits left of Copy, and Stop replaces it while running. The header has status, version, exit code and time, then Save as snippet, Run again, Copy, Clear, Close. Output is `--font-mono` on `--bg-panel`. Errors are `--text` on a 14% `--danger-bg` wash.

**All 20 themes, measured from pixels:** text at least 8.55:1, meta at least 5.41:1, error text on the wash at least 7.22:1.

- **Rejected:** `--danger-text` as plain red, about 1:1 on most themes because it belongs on `--danger-bg`; and that solid pair, 3.35:1 on Light and Dark.
- **Failed icon:** on `--danger-bg` it missed 3:1 on Light (2.91) and Nord (2.46), so the build uses `--danger-border`, which the theme sweep holds to 3:1.

## How it works

```text
renderer  run:start({ snippetId?, language, code }) · run:stop(runId) · run:output
main      refuses a secret snippetId and any language not enabled, reads the
          executable from settings, shows the confirmation if due, pipes code over stdin
```

- The renderer sends code and a language, and never a path or a command. The file picker lives in main, and a pick is checked with `--version`.
- That the confirmation was seen is saved by main, and the renderer has no way to set it.
- No temp files. Limits: 30s, 1 MB of output, one run per tab, killed on tab close and quit.

## Slices

| #   | Slice                                                                             | Size |
| --- | --------------------------------------------------------------------------------- | ---- |
| 1   | Docs: rules 1 and 7, `security.md`, README                                        | S    |
| 2   | Runner core: spawn, stdin, caps, kill, on Windows CI too                          | M    |
| 3   | Settings ▸ Integrations: Claude moved in; Languages toggle, picker, version check | M    |
| 4   | IPC glue: id to code, the confirmation, streaming                                 | M    |
| 5   | Pane, Run, Save as snippet, i18n, 20-theme sweep, E2E                             | L    |
| 6   | Run a line from the gutter (#195): run-range lexer, gutter button, Up to line N   | M    |

Roughly 2–3 weeks. These are estimates; nothing has been built. `SnippetDocument.vue`'s script is at its 100-line cap, so slice 5 extracts first.

## Risks

1. **Code from elsewhere runs on one click.** After the one confirmation, a Claude proposal or an import runs as easily as your own code, with your access to files and the network. This is the maintainer's accepted trade-off, stated in the dialog.
2. **A compromised window can run anything it writes** once a language is enabled and the dialog has been seen, because Run takes code from the window. It could also omit a secret's id to get past that refusal. Enabling a language in a dialog from main is the fence.
3. **"Nothing leaves your computer" is about the app, not your script.** The README now says the app makes no network requests on its own, the maintainer's wording. `docs/security.md` spells out what a script can do.
4. **Windows and macOS behaviour is untested by CI E2E**, which runs on Linux. Kill and stdin need testing by hand on Windows.

**Out of this version:** a menu item, shortcut or palette row for Run. The palette lists only menu items, and the approved design adds neither. Input to a running script, because there is no terminal.
