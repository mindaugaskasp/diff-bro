// The mergetool launcher, which differs from the difftool one in the only way
// that matters: it WAITS.
//
// The app is single-instance, so a launch returns as soon as the running window
// has been told. If the script exited there, git would read the merge as
// finished before the reader had chosen anything, and trustExitCode=true would
// be a lie. Polling $MERGED's modification time is what makes it true.
import { MARK } from './gitToolMark'
import { shQuote } from './shellQuote'

/** Beside the difftool launcher, so removing either leaves the other alone. */
export function gitMergeTarget(target) {
  return `${target}-merge`
}

/** @param {string} exePath  the installed app binary */
export function gitMergeScript(exePath, entryPath = null) {
  return `#!/bin/sh
${MARK}
before=$(ls -l "$3" 2>/dev/null)
${shQuote(exePath)}${entryPath ? ` ${shQuote(entryPath)}` : ''} mergetool "$1" "$2" "$3" || exit 1
# Wait for the reader. Exiting here would tell git the merge was resolved before
# anyone had looked at it.
while [ "$(ls -l "$3" 2>/dev/null)" = "$before" ]; do
  sleep 1
done
exit 0
`
}
