// Text the renderer builds for a `diffbro …` launch. Lives here, not beside the
// parser in src/main, because the renderer never imports from the main process.

/**
 * The refusal shown when every tab is in use. Names the files, because the
 * point of the message is that THOSE are the ones that did not open.
 * @param {string[]} files
 * @param {number} max
 * @returns {string}
 */
export function tabsFullMessage(files, max) {
  const names = (files ?? []).map((f) => String(f).split(/[\\/]/).pop()).filter(Boolean)
  const subject = names.length ? names.join(' and ') : 'those files'
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
