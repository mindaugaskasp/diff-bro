// Text the renderer builds for a `diffbro …` launch. Lives here, not beside the
// parser in src/main, because the renderer never imports from the main process.

// Past this the dialog is a wall of filenames and the count says it better.
const MAX_NAMED = 5

const listOf = (names) => {
  if (names.length <= 2) return names.join(' and ')
  const shown = names.slice(0, MAX_NAMED)
  const rest = names.length - shown.length
  if (rest) return `${shown.join(', ')} and ${rest} more`
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

/**
 * The refusal shown when every tab is in use. Names the files, because the
 * point of the message is that THOSE are the ones that did not open.
 *
 * Takes every path blocked SO FAR, not just the latest: `git mergetool` calls
 * the tool once per conflicted file and moves straight on, so the launches
 * arrive back to back and each one used to overwrite the message the one before
 * it raised. Duplicates collapse — a git comparison is one filename twice, as
 * a before and an after copy.
 * @param {string[]} files
 * @param {number} max
 * @returns {string}
 */
export function tabsFullMessage(files, max) {
  const names = (files ?? []).map((f) => String(f).split(/[\\/]/).pop()).filter(Boolean)
  const unique = [...new Set(names)]
  const subject = unique.length ? listOf(unique) : 'those files'
  return `Can't open ${subject} — all ${max} comparisons are in use. Close one and try again.`
}

/**
 * `Clipboard - 2026-08-01 09:34`, the name a clipboard capture is saved under.
 * @param {Date} [at]
 * @returns {string}
 */
export function clipboardSnippetName(at = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const d = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`
  return `Clipboard - ${d} ${p(at.getHours())}:${p(at.getMinutes())}`
}
