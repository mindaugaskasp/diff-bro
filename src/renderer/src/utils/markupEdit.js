// Marker-agnostic selection-edit helpers shared by the Jira and Markdown toolbar
// transforms (jiraMarkup / markdownMarkup): (whole text + selection offsets) →
// (new text + new selection). Pure, unit-testable.

export const selected = (m) => m.text.slice(m.start, m.end)
export const head = (m) => m.text.slice(0, m.start)
export const tail = (m) => m.text.slice(m.end)

// Replace the selection with `text`, landing the new selection at [selStart, selEnd].
export function splice(m, text, selStart, selEnd) {
  return { text: head(m) + text + tail(m), start: selStart, end: selEnd }
}

// Inline wrap with toggle-off when the markers already surround the selection.
export function wrap(m, prefix, suffix) {
  const sel = selected(m)
  if (
    sel.length >= prefix.length + suffix.length &&
    sel.startsWith(prefix) &&
    sel.endsWith(suffix)
  ) {
    const inner = sel.slice(prefix.length, sel.length - suffix.length)
    return splice(m, inner, m.start, m.start + inner.length)
  }
  if (head(m).endsWith(prefix) && tail(m).startsWith(suffix)) {
    const text = head(m).slice(0, -prefix.length) + sel + tail(m).slice(suffix.length)
    return { text, start: m.start - prefix.length, end: m.end - prefix.length }
  }
  return splice(
    m,
    prefix + sel + suffix,
    m.start + prefix.length,
    m.start + prefix.length + sel.length
  )
}

// Grow to whole lines, so a per-line prefix never starts mid-line.
export function lineBounds(m) {
  const start = m.text.lastIndexOf('\n', m.start - 1) + 1
  const nl = m.text.indexOf('\n', m.end)
  return { start, end: nl === -1 ? m.text.length : nl }
}

// A leading line marker that replaces any existing one matching `existingRe`, or
// toggles off. Markers here are mutually exclusive (heading levels, quote).
export function linePrefix(m, marker, existingRe) {
  const { start, end } = lineBounds(m)
  const block = m.text.slice(start, end)
  const bare = block.replace(existingRe, '')
  const next = block.startsWith(`${marker} `) ? bare : `${marker} ${bare}`
  return {
    text: m.text.slice(0, start) + next + m.text.slice(end),
    start,
    end: start + next.length
  }
}

// Per-line list marker on every non-blank line (toggle off when all have it).
export function listBlock(m, marker) {
  const { start, end } = lineBounds(m)
  const token = `${marker} `
  const lines = m.text.slice(start, end).split('\n')
  const nonBlank = lines.filter((l) => l.trim() !== '')
  const allMarked = nonBlank.length > 0 && nonBlank.every((l) => l.startsWith(token))
  const next = lines
    .map((l) => (l.trim() === '' ? l : allMarked ? l.slice(token.length) : token + l))
    .join('\n')
  return {
    text: m.text.slice(0, start) + next + m.text.slice(end),
    start,
    end: start + next.length
  }
}

// A fenced block wrapping the selection on its own lines.
export function blockWrap(m, opener, closer) {
  const sel = selected(m)
  const open = `${opener}\n`
  return splice(
    m,
    `${open}${sel}\n${closer}`,
    m.start + open.length,
    m.start + open.length + sel.length
  )
}
