// A file as git left it mid-merge: stable text with conflict regions between,
// each carrying both sides and — in diff3 style — the ancestor they came from.
// Pure, and it composes the resolved file back rather than editing in place.
//
// Every line keeps the ending it arrived with. git writes its markers with LF
// even into a CRLF file, so a single file-wide line ending found no conflicts in
// a genuinely mixed file — and writing that back put the markers on disk.

// Exactly seven characters, then end-of-line or a space before the label. A
// line merely STARTING with them is ordinary text.
const OURS = /^<<<<<<<(?: (.*))?$/
const BASE = /^\|\|\|\|\|\|\|(?: (.*))?$/
const SPLIT = /^=======$/
const THEIRS = /^>>>>>>>(?: (.*))?$/

const textOf = (raw) => raw.replace(/\r?\n$/, '')
const label = (match) => (match?.[1] ?? '').trim()

const stable = (raw) => ({ type: 'stable', raw, lines: raw.map(textOf) })

// A conflict git wrote always closes. One that does not is a file someone was
// editing by hand, and guessing which side the rest belongs to would silently
// drop the other.
function conflictAt(raw, start) {
  const sides = { ours: [], base: null, theirs: [] }
  let side = 'ours'
  for (let i = start + 1; i < raw.length; i++) {
    const line = textOf(raw[i])
    const closing = THEIRS.exec(line)
    if (closing) {
      return {
        conflict: {
          type: 'conflict',
          oursLabel: label(OURS.exec(textOf(raw[start]))),
          theirsLabel: label(closing),
          ours: sides.ours.map(textOf),
          theirs: sides.theirs.map(textOf),
          base: sides.base ? sides.base.map(textOf) : null,
          oursRaw: sides.ours,
          theirsRaw: sides.theirs
        },
        end: i
      }
    }
    if (BASE.test(line)) {
      sides.base = []
      side = 'base'
    } else if (SPLIT.test(line)) side = 'theirs'
    else sides[side].push(raw[i])
  }
  return null
}

/**
 * @param {string} text
 * @returns {{segments: Array}|null} null when the file's markers do not close.
 */
export function parseConflicts(text) {
  // Split AFTER each newline, so a line carries its own ending and a mixed file
  // survives the round trip byte for byte.
  const raw = String(text ?? '').split(/(?<=\n)/)
  const segments = []
  let held = []
  for (let i = 0; i < raw.length; i++) {
    if (!OURS.test(textOf(raw[i]))) {
      held.push(raw[i])
      continue
    }
    const found = conflictAt(raw, i)
    if (!found) return null
    // An empty run between two conflicts, or before the first, is not a segment
    // anyone renders — a file that opens on a conflict has nothing above it.
    if (held.length) segments.push(stable(held))
    segments.push(found.conflict)
    held = []
    i = found.end
  }
  if (held.length) segments.push(stable(held))
  return { segments }
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
  ours: (c) => c.oursRaw,
  theirs: (c) => c.theirsRaw,
  both: (c) => [...c.oursRaw, ...c.theirsRaw],
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
    if (segment.type === 'stable') out.push(...segment.raw)
    else out.push(...CHOICES[choices[at++]](segment))
  }
  return out.join('')
}
