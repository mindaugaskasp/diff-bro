// Delimited text (CSV/TSV) as a grid, so it can be compared cell by cell in the
// spreadsheet viewer instead of line by line. RFC 4180 quoting: "" escapes a
// quote, a quoted field may hold delimiters and newlines. Pure.

const MAX_ROWS = 200_000
const MAX_COLUMNS = 16_384
const SNIFF_ROWS = 20
const CANDIDATES = [',', '\t', ';', '|']
const DELIMITED_EXT = /\.(csv|tsv)$/i

// Unquoted digits become numbers so the grid right-aligns them and the diff
// compares them as values. A quoted or zero-padded field stays text — that is
// how an id, a phone number or a postcode survives the round trip.
const NUMERIC = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

function coerce(field, wasQuoted) {
  if (wasQuoted || field === '') return field
  return NUMERIC.test(field) ? Number(field) : field
}

function pushField(st) {
  if (st.row.length < MAX_COLUMNS) st.row.push(coerce(st.field, st.quotedField))
  st.field = ''
  st.quotedField = false
}

function pushRow(st) {
  pushField(st)
  st.rows.push(st.row)
  st.row = []
}

// Inside a quoted field, starting just past the opening quote.
function readQuoted(st, text, from) {
  const q = text.indexOf('"', from)
  if (q < 0) {
    st.field += text.slice(from)
    return text.length
  }
  st.field += text.slice(from, q)
  if (text[q + 1] === '"') {
    st.field += '"'
    return q + 2
  }
  st.quoted = false
  return q + 1
}

function runEnd(text, from, delimiter) {
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === delimiter || c === '"' || c === '\n' || c === '\r') return i
  }
  return text.length
}

// One move through the text, returning the next position.
function step(st, body, i, delimiter) {
  if (st.quoted) return readQuoted(st, body, i)
  const ch = body[i]
  if (ch === '"' && st.field === '') {
    st.quoted = true
    st.quotedField = true
    return i + 1
  }
  if (ch === delimiter) {
    pushField(st)
    return i + 1
  }
  if (ch === '\n' || ch === '\r') {
    pushRow(st)
    return i + (ch === '\r' && body[i + 1] === '\n' ? 2 : 1)
  }
  const end = runEnd(body, i, delimiter)
  st.field += body.slice(i, end)
  return end
}

/**
 * @param {string} text
 * @param {{delimiter?: string, maxRows?: number}} [opts]
 * @returns {{rows: Array<Array<string|number>>, truncated: boolean}}
 */
export function parseDelimited(text, opts = {}) {
  const delimiter = opts.delimiter ?? ','
  const maxRows = opts.maxRows ?? MAX_ROWS
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const st = { rows: [], row: [], field: '', quotedField: false, quoted: false }
  let i = 0
  while (i < body.length && st.rows.length < maxRows) i = step(st, body, i, delimiter)
  if (st.field !== '' || st.row.length) pushRow(st)
  return { rows: st.rows, truncated: i < body.length }
}

// A delimiter scores only when the head of the file agrees on a row width above
// one — the reading that actually parses, rather than the commonest character.
function scoreDelimiter(text, delimiter) {
  const { rows } = parseDelimited(text, { delimiter, maxRows: SNIFF_ROWS })
  const width = rows[0]?.length ?? 0
  if (width < 2) return 0
  return rows.every((r) => r.length === width) ? width : 0
}

export function sniffDelimiter(text) {
  let best = ','
  let bestScore = 0
  for (const d of CANDIDATES) {
    const score = scoreDelimiter(text, d)
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

// Extension-gated, the way YAML is: prose is full of commas, and sniffing every
// text file into a grid would offer the toggle where it means nothing.
function delimiterFor(side) {
  const name = side?.name ?? ''
  const text = side?.content ?? ''
  if (!DELIMITED_EXT.test(name) || !text.trim()) return null
  return /\.tsv$/i.test(name) ? '\t' : sniffDelimiter(text)
}

/**
 * The delimiter BOTH sides parse as, or null — the gate on offering the grid.
 * @returns {string|null}
 */
export function delimitedKind(left, right) {
  const l = delimiterFor(left)
  return l && l === delimiterFor(right) ? l : null
}
