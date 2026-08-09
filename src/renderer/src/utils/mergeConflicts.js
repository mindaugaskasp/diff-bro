// A file as git left it mid-merge: stable text with conflict regions between,
// each carrying both sides and — in diff3 style — the ancestor they came from.
// Pure, and it composes the resolved file back rather than editing in place.

const OURS = /^<<<<<<< ?(.*)$/
const BASE = /^\|\|\|\|\|\|\| ?(.*)$/
const SPLIT = /^=======\s*$/
const THEIRS = /^>>>>>>> ?(.*)$/

const stable = (lines) => ({ type: 'stable', lines })

// A conflict git wrote always closes. One that does not is a file someone was
// editing by hand, and guessing which side the rest belongs to would silently
// drop the other.
function conflictAt(lines, start) {
  const conflict = {
    type: 'conflict',
    oursLabel: OURS.exec(lines[start])[1].trim(),
    theirsLabel: '',
    ours: [],
    base: null,
    theirs: []
  }
  let side = 'ours'
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (BASE.test(line)) {
      conflict.base = []
      side = 'base'
    } else if (SPLIT.test(line)) side = 'theirs'
    else if (THEIRS.test(line)) {
      conflict.theirsLabel = THEIRS.exec(line)[1].trim()
      return { conflict, end: i }
    } else conflict[side].push(line)
  }
  return null
}

/**
 * @param {string} text
 * @returns {{segments: Array, eol: string, trailingEol: boolean}|null} null when
 *   the file's markers do not close.
 */
export function parseConflicts(text) {
  const source = String(text ?? '')
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const trailingEol = source.endsWith(eol)
  const lines = (trailingEol ? source.slice(0, -eol.length) : source).split(eol)

  const segments = []
  let held = []
  for (let i = 0; i < lines.length; i++) {
    if (!OURS.test(lines[i])) {
      held.push(lines[i])
      continue
    }
    const found = conflictAt(lines, i)
    if (!found) return null
    // An empty run between two conflicts, or before the first, is not a segment
    // anyone renders — a file that opens on a conflict has nothing above it.
    if (held.length) segments.push(stable(held))
    segments.push(found.conflict)
    held = []
    i = found.end
  }
  if (held.length) segments.push(stable(held))
  return { segments, eol, trailingEol }
}

const conflicts = (parsed) => (parsed?.segments ?? []).filter((s) => s.type === 'conflict')

/** How many regions the reader has to decide. */
export function conflictCount(parsed) {
  return conflicts(parsed).length
}

/** How many of them are still undecided. */
export function unresolvedCount(parsed, choices = []) {
  return conflicts(parsed).filter((_, i) => !CHOICES[choices[i]]).length
}

// Both keeps the file's own order — ours came first in it.
const CHOICES = {
  ours: (c) => c.ours,
  theirs: (c) => c.theirs,
  both: (c) => [...c.ours, ...c.theirs],
  neither: () => []
}

/**
 * The resolved file, or null while any conflict is undecided — writing a
 * half-resolved file would hand git one with markers still in it.
 * @param {object} parsed  from parseConflicts
 * @param {Array<'ours'|'theirs'|'both'|'neither'|null>} choices  one per conflict
 * @returns {string|null}
 */
export function composeMerge(parsed, choices = []) {
  if (!parsed || unresolvedCount(parsed, choices)) return null
  const out = []
  let at = 0
  for (const segment of parsed.segments) {
    if (segment.type === 'stable') out.push(...segment.lines)
    else out.push(...CHOICES[choices[at++]](segment))
  }
  return out.join(parsed.eol) + (parsed.trailingEol ? parsed.eol : '')
}
