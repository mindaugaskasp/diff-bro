// {{token}} placeholders in a snippet's name, resolved once at save so what
// lands in the library is plain text — a name that re-evaluated on every read
// would rename yesterday's note to today.
//
// Pure, and the tokens carry catalogue KEYS rather than translated labels: a
// table built here at module load would freeze the language the app started in
// (docs/standards.md).

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const shifted = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)

// ISO-8601 week, written out rather than pulled in: a date library would earn
// its audit for timezone arithmetic, and this is day-granularity local time with
// one rule. The rule is that a week belongs to the year of its THURSDAY, which
// is why 1 January can land in week 52 of the year before.
// Computed in UTC so a DST boundary cannot shorten a day out from under it.
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = d.getUTCDay() || 7 // Monday 1 … Sunday 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

const named = (d, locale, opts) => new Intl.DateTimeFormat(locale, opts).format(d)

/**
 * Every token, in the order the hint lists them. `resolve` takes the clock and
 * the locale, so nothing here reads either on its own.
 */
export const TEMPLATE_TOKENS = [
  { token: 'today', labelKey: 'snippetTemplates.today', resolve: (d) => iso(d) },
  { token: 'time', labelKey: 'snippetTemplates.time', resolve: (d) => clock(d) },
  { token: 'now', labelKey: 'snippetTemplates.now', resolve: (d) => `${iso(d)} ${clock(d)}` },
  {
    token: 'yesterday',
    labelKey: 'snippetTemplates.yesterday',
    resolve: (d) => iso(shifted(d, -1))
  },
  { token: 'tomorrow', labelKey: 'snippetTemplates.tomorrow', resolve: (d) => iso(shifted(d, 1)) },
  { token: 'week', labelKey: 'snippetTemplates.week', resolve: (d) => isoWeek(d) },
  {
    token: 'weekday',
    labelKey: 'snippetTemplates.weekday',
    resolve: (d, locale) => named(d, locale, { weekday: 'long' })
  },
  {
    token: 'month',
    labelKey: 'snippetTemplates.month',
    resolve: (d, locale) => named(d, locale, { month: 'long' })
  },
  { token: 'year', labelKey: 'snippetTemplates.year', resolve: (d) => String(d.getFullYear()) }
]

const BY_TOKEN = new Map(TEMPLATE_TOKENS.map((t) => [t.token, t]))

// Tolerant of spacing, because a name is typed by hand: {{ today }} is the same
// token as {{today}}. Two copies on purpose — `test` on a /g/ regex advances
// lastIndex, so a shared one answers differently on alternate calls.
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g
const ANY_PLACEHOLDER = /\{\{\s*[a-zA-Z]+\s*\}\}/

/**
 * @param {string} text
 * @param {{ now?: Date, locale?: string }} [opts]
 * @returns {string} the same text with every KNOWN token replaced. An unknown
 *   one is left exactly as typed — silently blanking it would lose what the
 *   person meant to keep.
 */
export function expandTemplates(text, { now = new Date(), locale = 'en' } = {}) {
  if (typeof text !== 'string' || !text.includes('{{')) return text ?? ''
  return text.replace(PLACEHOLDER, (whole, name) => {
    const spec = BY_TOKEN.get(name.toLowerCase())
    return spec ? spec.resolve(now, locale) : whole
  })
}

/** Whether this text has anything to expand — drives the live hint. */
export const hasTemplate = (text) => typeof text === 'string' && ANY_PLACEHOLDER.test(text)
