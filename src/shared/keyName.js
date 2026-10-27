// A key's name is cosmetic — never part of the fingerprint or a trust decision —
// but it is the only thing that tells two contacts apart in a list.
export const MAX_KEY_NAME = 40

const segmenter = new Intl.Segmenter()

/** @param {unknown} value */
export function normalizeKeyName(value) {
  if (typeof value !== 'string') return ''
  let out = ''
  for (const ch of value) {
    const c = ch.codePointAt(0)
    out += c < 0x20 || c === 0x7f ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** @param {string} name */
export const keyNameLength = (name) => [...segmenter.segment(name)].length

/**
 * @param {unknown} value
 * @returns {'empty' | 'too-long' | null}
 */
export function keyNameProblem(value) {
  const name = normalizeKeyName(value)
  if (!name) return 'empty'
  return keyNameLength(name) > MAX_KEY_NAME ? 'too-long' : null
}

export const isSameKeyName = (a, b) =>
  normalizeKeyName(a).toLowerCase() === normalizeKeyName(b).toLowerCase()

/**
 * @param {{ fingerprint: string, label: string }[]} trusted
 * @returns {{ fingerprint: string, label: string } | null} another key already wearing the name
 */
export const takenBy = (trusted, name, fingerprint) =>
  trusted.find((t) => t.fingerprint !== fingerprint && isSameKeyName(t.label, name)) ?? null

/** The name with the first free " (n)" suffix, shortened so it still fits. */
export function distinctKeyName(name, trusted, fingerprint = null) {
  const base = normalizeKeyName(name)
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const room = MAX_KEY_NAME - suffix.length
    const head = [...segmenter.segment(base)]
      .slice(0, room)
      .map((s) => s.segment)
      .join('')
      .trimEnd()
    const candidate = head + suffix
    if (!takenBy(trusted, candidate, fingerprint)) return candidate
  }
}

/** A name read from a key file or text: refused, never cut, when too long. */
export function importedKeyName(value) {
  const name = normalizeKeyName(value)
  if (keyNameLength(name) > MAX_KEY_NAME) throw new Error('name-too-long')
  return name
}

/** The error a failed key read reports: its name was too long, or it was not a key. */
export const keyReadError = (err, fallback = 'not-a-key') =>
  err?.message === 'name-too-long' ? 'name-too-long' : fallback
