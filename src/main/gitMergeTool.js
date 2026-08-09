// The mergetool launcher, which differs from the difftool one in the only way
// that matters: it WAITS.
//
// The app is single-instance, so a launch returns as soon as the running window
// has been told. If the script exited there, git would read the merge as
// finished before the reader had chosen anything, and trustExitCode=true would
// be a lie. Polling $MERGED's modification time is what makes it true.
import { MARK } from './gitToolMark'
import { shQuote } from './shellQuote'

// Two hours: longer than any real conflict takes, short enough that a window
// closed and forgotten does not hold a terminal for ever.
const WAIT_SECONDS = 7200

/** Beside the difftool launcher, so removing either leaves the other alone. */
export function gitMergeTarget(target) {
  return `${target}-merge`
}

/** @param {string} exePath  the installed app binary */
export function gitMergeScript(exePath, entryPath = null) {
  return `#!/bin/sh
${MARK}
done_file="$3.diffbro-merge-done"
rm -f "$done_file"
${shQuote(exePath)}${entryPath ? ` ${shQuote(entryPath)}` : ''} mergetool "$1" "$2" "$3" || exit 1
# Wait for the reader. Exiting here would tell git the merge was resolved before
# anyone had looked at it. The bound is what stops a closed window hanging the
# terminal for ever.
waited=0
while [ ! -f "$done_file" ] && [ "$waited" -lt ${WAIT_SECONDS} ]; do
  sleep 1
  waited=$((waited + 1))
done
if [ ! -f "$done_file" ]; then exit 1; fi
verdict=$(cat "$done_file" 2>/dev/null)
rm -f "$done_file"
[ "$verdict" = "written" ] || exit 1
exit 0
`
}
