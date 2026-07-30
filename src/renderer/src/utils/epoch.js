// Pure epoch/date conversions for the Epoch tool. Vue-free so it unit-tests
// without a DOM; ToolEpoch.vue is the only UI and hosts these in both the Tools
// dialog and the Quick Look launcher.

const S = 'seconds'
const ONLY_DIGITS = /^-?\d{1,15}$/

const toMs = (n, unit) => (unit === S ? n * 1000 : n)
const fromMs = (ms, unit) => (unit === S ? Math.floor(ms / 1000) : ms)
const pad = (n) => String(n).padStart(2, '0')

/** Current epoch in `unit`, as a string. */
export function nowEpoch(unit = S, at = Date.now()) {
  return String(fromMs(at, unit))
}

/** A signed ms delta → "in about 3 hours" / "2 days ago" / "just now". */
export function relativeTime(ms) {
  const abs = Math.abs(ms)
  const steps = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000]
  ]
  for (const [name, size] of steps) {
    if (abs >= size) {
      const n = Math.round(abs / size)
      const phrase = `${n} ${name}${n === 1 ? '' : 's'}`
      return ms >= 0 ? `in ${phrase}` : `${phrase} ago`
    }
  }
  return 'just now'
}

/**
 * Formatted rows for an epoch value read as `unit`. [] when it isn't a timestamp.
 * @param {string} value
 * @param {{ unit?: 'seconds'|'millis' }} [opts]
 * @returns {Array<{ key: string, value: string }>}
 */
export function epochRows(value, { unit = S } = {}, now = Date.now()) {
  const t = String(value).trim()
  if (!ONLY_DIGITS.test(t)) return []
  const date = new Date(toMs(Number(t), unit))
  if (Number.isNaN(date.getTime())) return []
  return [
    { key: 'ISO 8601', value: date.toISOString() },
    { key: 'Relative', value: relativeTime(date.getTime() - now) },
    {
      key: 'Local',
      value: date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
    }
  ]
}

/**
 * A datetime-local value ("2025-07-30T13:00") → epoch in `unit`. `tz` says whether
 * that wall-clock reading is UTC or the machine's local time. '' if empty/unparseable.
 * @param {string} local
 * @param {{ unit?: 'seconds'|'millis', tz?: 'UTC'|'Local' }} [opts]
 */
export function pickToEpoch(local, { unit = S, tz = 'UTC' } = {}) {
  // Accept the "YYYY-MM-DD HH:MM" the field shows as well as the native picker's
  // "YYYY-MM-DDTHH:MM".
  const s = String(local ?? '')
    .trim()
    .replace(' ', 'T')
  if (!s) return ''
  const ms = Date.parse(tz === 'UTC' ? `${s}Z` : s)
  return Number.isNaN(ms) ? '' : String(fromMs(ms, unit))
}

/** The current wall-clock as a datetime-local string, read in `tz`. */
export function nowLocalInput(tz = 'UTC', at = new Date()) {
  const p =
    tz === 'UTC'
      ? [
          at.getUTCFullYear(),
          at.getUTCMonth() + 1,
          at.getUTCDate(),
          at.getUTCHours(),
          at.getUTCMinutes()
        ]
      : [at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]
  return `${p[0]}-${pad(p[1])}-${pad(p[2])}T${pad(p[3])}:${pad(p[4])}`
}
