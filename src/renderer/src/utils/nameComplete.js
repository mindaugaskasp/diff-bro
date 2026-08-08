// Inline completion for a snippet name, with shell semantics: complete to the
// longest common prefix of every matching name, never past the point where the
// library stops agreeing. A completion that guessed `Deploy — dev` when you
// meant staging is worse than no completion at all.

/**
 * Names worth completing against: non-secret, non-empty, de-duplicated. A
 * secret's guarantee is about its contents, but its NAME hints at what it is,
 * and offering that inside an unrelated snippet leaks intent nobody asked for.
 * @param {Array<{name?: string, secret?: boolean}>} entries
 * @returns {string[]}
 */
export function indexableNames(entries) {
  const out = []
  for (const e of entries ?? []) {
    const name = String(e?.name ?? '').trim()
    if (!name || e?.secret === true || out.includes(name)) continue
    out.push(name)
  }
  return out
}

/** How far two strings agree, compared case-insensitively. */
function sharedLength(a, b) {
  const limit = Math.min(a.length, b.length)
  let i = 0
  while (i < limit && a[i].toLowerCase() === b[i].toLowerCase()) i += 1
  return i
}

/**
 * The text to show ghosted after the caret — always a literal continuation of
 * `typed`, in the STORED name's casing so accepting it yields a real name.
 * @param {string} typed
 * @param {string[]} names
 * @returns {string} the suffix, or '' when there is nothing to offer
 */
export function completionFor(typed, names) {
  const text = String(typed ?? '')
  // expandTemplates owns a name carrying a token; completing over a half-typed
  // `{{today}}` would produce a name the user never chose.
  if (!text.trim() || text.includes('{{')) return ''

  const lower = text.toLowerCase()
  const all = (names ?? []).map((n) => String(n ?? '').trim())
  // Typing a name in full is finishing, not the start of a longer one — and Tab
  // is the only key that leaves the field, so a ghost here renames on the way
  // out. A stored name carrying {{token}} is refused for the same reason the
  // typed text is: the editor expands it on save, so accepting would store
  // something the user never saw.
  if (all.some((n) => n.toLowerCase() === lower)) return ''
  const matches = all.filter(
    (n) => n.length > text.length && n.toLowerCase().startsWith(lower) && !n.includes('{{')
  )
  if (!matches.length) return ''

  // Prefer a match whose casing agrees with what was typed; otherwise the ghost
  // depends on store order and can show a casing no stored name has.
  const ordered = [...matches].sort(
    (a, b) => Number(b.startsWith(text)) - Number(a.startsWith(text))
  )
  let common = ordered[0]
  for (const m of ordered) common = common.slice(0, sharedLength(common, m))
  return common.slice(text.length)
}
