// Number formats, far enough to stop a date reading as 45870. The raw value is
// what the diff compares; this only decides what the grid SHOWS, so the goal is
// an unambiguous, locale-free rendering rather than an Excel format engine.

// The ids Excel never writes into styles.xml because every reader knows them.
const BUILTIN = new Map([
  [9, '0%'],
  [10, '0.00%'],
  [14, 'mm-dd-yy'],
  [15, 'd-mmm-yy'],
  [16, 'd-mmm'],
  [17, 'mmm-yy'],
  [18, 'h:mm AM/PM'],
  [19, 'h:mm:ss AM/PM'],
  [20, 'h:mm'],
  [21, 'h:mm:ss'],
  [22, 'm/d/yy h:mm'],
  [45, 'mm:ss'],
  [46, '[h]:mm:ss'],
  [47, 'mmss.0']
])

export function builtinFormat(id) {
  return BUILTIN.get(id) ?? ''
}

// Everything that is decoration rather than a token: escaped characters,
// "quoted text", and [Red] / [$€-2] blocks whose letters would otherwise read
// as date tokens.
function stripLiterals(code) {
  return code
    .replace(/\\./g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
}

/** @returns {'date'|'time'|'datetime'|'percent'|'other'} */
export function formatKind(code) {
  if (!code || code === 'General') return 'other'
  const elapsed = /\[[hms]+\]/i.test(code)
  const body = stripLiterals(code).split(';')[0]
  const date = /[yd]/i.test(body)
  const time = elapsed || /[hs]/i.test(body)
  if (date && time) return 'datetime'
  if (date) return 'date'
  if (time) return 'time'
  return body.includes('%') ? 'percent' : 'other'
}

const DAY_MS = 86_400_000
// 1899-12-30, the epoch that makes serial 61 (1900-03-01) land correctly.
const EPOCH_1900 = Date.UTC(1899, 11, 30)
const EPOCH_1904 = Date.UTC(1904, 0, 1)

/**
 * An Excel date serial as a UTC Date. Serials below 61 are shifted a day: the
 * 1900 system counts a 29th of February that never happened.
 */
export function serialToDate(serial, date1904 = false) {
  const days = date1904 ? serial : serial + (serial < 61 ? 1 : 0)
  const base = date1904 ? EPOCH_1904 : EPOCH_1900
  return new Date(base + Math.round(days * DAY_MS))
}

const pad = (n, width = 2) => String(n).padStart(width, '0')

function isoDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function isoTime(d) {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function percentText(value, code) {
  const decimals = /\.(0+)/.exec(stripLiterals(code).split(';')[0])?.[1].length ?? 0
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * What the grid should show for a numeric cell, or null when the raw value
 * already reads correctly and no override is warranted.
 * @param {number} value
 * @param {string} code format code from styles.xml
 * @param {boolean} date1904
 * @returns {string|null}
 */
export function displayText(value, code, date1904 = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const kind = formatKind(code)
  if (kind === 'percent') return percentText(value, code)
  if (kind === 'other') return null
  if (value < 0 || value > 2_958_465) return null
  const d = serialToDate(value, date1904)
  if (kind === 'date') return isoDate(d)
  if (kind === 'time') return isoTime(d)
  return `${isoDate(d)} ${isoTime(d)}`
}
